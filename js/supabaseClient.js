/**
 * SmartFinance - Módulo de Cliente Supabase & Feed Financiero Macro
 * Archivo: js/supabaseClient.js
 */

const SUPABASE_URL = 'https://TU-PROYECTO-ID.supabase.co'; // Reemplazar con tu URL real
const SUPABASE_ANON_KEY = 'TU-ANON-PUBLIC-KEY';           // Reemplazar con tu key real

// Inicialización del cliente oficial mediante el bundle CDN global cargado en index.html
const { createClient } = window.supabase;
export const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

/**
 * Tipo de cambio base presupuestario unificado para cálculos patrimoniales
 * y conversiones automáticas USD -> ARS.
 */
export let TIPO_CAMBIO_PRESUPUESTO = 1200.00;

/**
 * Formatea el badge de variación porcentual respetando el sistema de diseño
 */
function formatVariationBadge(variacionStr, isInverse = false) {
    const raw = String(variacionStr || '').trim();
    if (!raw || raw === '0' || raw === '0.0' || raw === '0%' || raw === '0.0%' || raw === '= 0.0%') {
        return `<span class="var-badge neutral">= 0.0%</span>`;
    }

    const cleanNum = parseFloat(raw.replace('%', '').replace('+', '').replace('▲', '').replace('▼', '').replace('=', '').trim().replace(',', '.'));
    if (isNaN(cleanNum) || cleanNum === 0) {
        return `<span class="var-badge neutral">= 0.0%</span>`;
    }

    if (cleanNum > 0) {
        const cssClass = isInverse ? 'down' : 'up';
        return `<span class="var-badge ${cssClass}"><i class="fa-solid fa-caret-up"></i> +${cleanNum.toFixed(1)}%</span>`;
    } else {
        const cssClass = isInverse ? 'up' : 'down';
        return `<span class="var-badge ${cssClass}"><i class="fa-solid fa-caret-down"></i> -${Math.abs(cleanNum).toFixed(1)}%</span>`;
    }
}

/**
 * Genera el HTML de una tarjeta de divisa bimonetaria (Compra / Venta limpias)
 */
function createCurrencyCardHTML(title, compra, venta, subtext, variacion = '= 0.0%') {
    const formatNumber = (val) => {
        if (!val || isNaN(val)) return 'N/D';
        const num = parseFloat(val);
        return `$${num.toLocaleString('es-AR', { minimumFractionDigits: (num % 1 !== 0 ? 1 : 0), maximumFractionDigits: 2 })}`;
    };

    const fCompra = formatNumber(compra);
    const fVenta = formatNumber(venta);
    const varBadgeHTML = formatVariationBadge(variacion);

    return `
        <div class="market-pill">
            <div class="market-pill-header">
                <span class="title">${title}</span>
                ${varBadgeHTML}
            </div>
            <div class="val-group">
                <div class="val-row">
                    <span class="lbl">Compra</span>
                    <span class="num" style="color: var(--text-muted); font-size: 12.5px; font-weight: 600;">${fCompra}</span>
                </div>
                <div class="val-row">
                    <span class="lbl">Venta</span>
                    <div class="num-box">
                        <span class="num" style="color: #ffffff; font-size: 13.5px; font-weight: 700;">${fVenta}</span>
                    </div>
                </div>
            </div>
            <span class="sub">${subtext}</span>
        </div>
    `;
}

/**
 * Genera el HTML de una tarjeta de indicador macroeconómico de cifra única
 */
function createMacroCardHTML(title, value, subtext, badgeText, badgeClass = 'down') {
    const icon = (badgeText.includes('+') || badgeText.includes('▲')) ? '<i class="fa-solid fa-caret-up"></i>' : '';
    const cleanBadgeText = badgeText.replace('▲', '').replace('▼', '').trim();

    return `
        <div class="market-pill">
            <span class="title">${title}</span>
            <div class="val-row" style="margin: 4px 0;">
                <span class="num" style="font-size: 18px; font-weight: 800; font-family: 'Urbanist', sans-serif; color: #ffffff;">${value}</span>
                <span class="var-badge ${badgeClass}">${icon} ${cleanBadgeText}</span>
            </div>
            <span class="sub">${subtext}</span>
        </div>
    `;
}

/**
 * Consulta cotizaciones financieras en tiempo real y renderiza la barra macro superior.
 * Notifica a app.js mediante el evento personalizado 'market-fx-updated'.
 */
export async function fetchMarketData() {
    const container = document.getElementById('market-bar-container');
    const statusTag = document.getElementById('market-status-tag');

    try {
        const response = await fetch('https://dolarapi.com/v1/dolares');
        if (!response.ok) throw new Error('Error al conectar con el servicio de divisas');
        
        const data = await response.json();
        
        const oficial = data.find(d => d.casa === 'oficial');
        const blue = data.find(d => d.casa === 'blue');
        const mep = data.find(d => d.casa === 'bolsa');

        // Actualiza el tipo de cambio presupuestario dinámicamente con el valor MEP de venta
        if (mep && mep.venta) {
            TIPO_CAMBIO_PRESUPUESTO = parseFloat(mep.venta);
        }

        if (container) {
            container.innerHTML = `
                ${createCurrencyCardHTML('Dólar Oficial', oficial?.compra, oficial?.venta, 'Banco Nación', '= 0.0%')}
                ${createCurrencyCardHTML('Dólar Blue', blue?.compra, blue?.venta, 'Informal', '= 0.0%')}
                ${createCurrencyCardHTML('Dólar MEP', mep?.compra, mep?.venta, 'Bolsa / Cable', '= 0.0%')}
                ${createMacroCardHTML('Riesgo País', '873 pb', 'JP Morgan EMBI+', '▲ +0.4%', 'down')}
                ${createMacroCardHTML('Inflación IPC', '1,9%', 'INDEC (Septiembre 2026)', '▲ +0.2', 'down')}
            `;
        }

        if (statusTag) {
            statusTag.innerHTML = `<span class="status-pulse-dot"></span> EN VIVO`;
        }

        window.dispatchEvent(new CustomEvent('market-fx-updated'));

    } catch (error) {
        console.warn('Fallo en la sincronización en vivo del mercado:', error);
        
        if (statusTag) {
            statusTag.innerHTML = `<span class="status-pulse-dot" style="background:var(--warning);"></span> MODO FIJO`;
            statusTag.style.borderColor = 'var(--warning)';
            statusTag.style.color = 'var(--warning)';
        }

        if (container) {
            container.innerHTML = `
                ${createCurrencyCardHTML('Dólar Oficial', 1520, 1570, 'Banco Nación', '= 0.0%')}
                ${createCurrencyCardHTML('Dólar Blue', 1535, 1555, 'Informal', '= 0.0%')}
                ${createCurrencyCardHTML('Dólar MEP', TIPO_CAMBIO_PRESUPUESTO, TIPO_CAMBIO_PRESUPUESTO, 'Bolsa / Cable', '= 0.0%')}
                ${createMacroCardHTML('Riesgo País', '873 pb', 'JP Morgan EMBI+', '▲ +0.4%', 'down')}
                ${createMacroCardHTML('Inflación IPC', '1,9%', 'INDEC (Septiembre 2026)', '▲ +0.2', 'down')}
            `;
        }
    }
}
