/**
 * SmartFinance - Módulo de Cliente Supabase & Feed Financiero Macro en Vivo
 * Archivo: js/supabaseClient.js (v7.9)
 */

export const SUPABASE_URL = "https://uszneehbjssjractaleh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzem5lZWhianNzanJhY3RhbGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjE3NzMsImV4cCI6MjA5ODMzNzc3M30.DGRmWfXWcqgfA7FrFuCrBBs9hSLwSqSYyDej4_vaxi4";

const { createClient } = window.supabase;
export const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Recupera el último MEP válido persistido en localStorage como respaldo ante cortes de red
const savedMep = parseFloat(localStorage.getItem('sf_last_mep_fx'));
export let TIPO_CAMBIO_PRESUPUESTO = (isFinite(savedMep) && savedMep > 0) ? savedMep : 1200.00;

const MESES_CAP = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

/**
 * Formatea el badge de variación porcentual respetando el sistema de diseño
 */
function formatVariationBadge(variacionStr, isInverse = false) {
    const raw = String(variacionStr || '').trim();
    if (!raw || raw === '0' || raw === '0.0' || raw === '0%' || raw === '0.0%' || raw === '= 0.0%' || raw === '= 0.0 pp') {
        return `<span class="var-badge neutral">${raw.includes('pp') ? '= 0.0 pp' : '= 0.0%'}</span>`;
    }

    const isPP = raw.includes('pp');
    const suffix = isPP ? ' pp' : '%';
    const cleanNum = parseFloat(
        raw.replace('pp', '')
           .replace('%', '')
           .replace('+', '')
           .replace('▲', '')
           .replace('▼', '')
           .replace('=', '')
           .trim()
           .replace(',', '.')
    );

    if (isNaN(cleanNum) || Math.abs(cleanNum) < 0.05) {
        return `<span class="var-badge neutral">= 0.0${suffix}</span>`;
    }

    if (cleanNum > 0) {
        const cssClass = isInverse ? 'down' : 'up';
        return `<span class="var-badge ${cssClass}"><i class="fa-solid fa-caret-up"></i> +${cleanNum.toFixed(1)}${suffix}</span>`;
    } else {
        const cssClass = isInverse ? 'up' : 'down';
        return `<span class="var-badge ${cssClass}"><i class="fa-solid fa-caret-down"></i> -${Math.abs(cleanNum).toFixed(1)}${suffix}</span>`;
    }
}

/**
 * Calcula la variación porcentual diaria entre cotización actual y cierre anterior
 */
function computeDailyPctVar(currVenta, prevVenta) {
    const c = parseFloat(currVenta);
    const p = parseFloat(prevVenta);
    if (!isFinite(c) || !isFinite(p) || p <= 0) return '= 0.0%';
    const pct = ((c - p) / p) * 100;
    if (Math.abs(pct) < 0.05) return '= 0.0%';
    return pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}

/**
 * Obtiene el cierre previo de cada dólar usando el historial de ArgentinaDatos o respaldo local
 */
function resolvePreviousDollarCloses(histDolaresList, currentQuotes) {
    const houses = ['oficial', 'blue', 'bolsa'];
    const prevCloses = {};

    if (Array.isArray(histDolaresList) && histDolaresList.length > 0) {
        houses.forEach(casa => {
            const rows = histDolaresList
                .filter(r => r && r.casa === casa && parseFloat(r.venta) > 0)
                .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

            if (rows.length >= 2) {
                const lastRow = rows[rows.length - 1];
                const currVal = parseFloat(currentQuotes[casa]?.venta) || 0;
                // Si el último registro histórico ya coincide con hoy, tomamos el anteúltimo como cierre previo
                if (currVal > 0 && Math.abs(parseFloat(lastRow.venta) - currVal) < 0.01) {
                    prevCloses[casa] = parseFloat(rows[rows.length - 2].venta);
                } else {
                    prevCloses[casa] = parseFloat(lastRow.venta);
                }
            }
        });
    }

    // Respaldo y persistencia diaria en localStorage
    try {
        const todayStr = new Date().toISOString().substring(0, 10);
        const stored = JSON.parse(localStorage.getItem('sf_fx_daily_ref') || 'null');

        if (stored && stored.date === todayStr && stored.prevClose) {
            houses.forEach(casa => {
                if (!prevCloses[casa] && stored.prevClose[casa]) {
                    prevCloses[casa] = stored.prevClose[casa];
                }
            });
        } else if (stored && stored.date !== todayStr && stored.current) {
            houses.forEach(casa => {
                if (!prevCloses[casa] && stored.current[casa]) {
                    prevCloses[casa] = stored.current[casa];
                }
            });
        }

        localStorage.setItem('sf_fx_daily_ref', JSON.stringify({
            date: todayStr,
            prevClose: prevCloses,
            current: {
                oficial: parseFloat(currentQuotes.oficial?.venta) || 0,
                blue: parseFloat(currentQuotes.blue?.venta) || 0,
                bolsa: parseFloat(currentQuotes.bolsa?.venta) || 0
            }
        }));
    } catch (e) {
        console.warn('No se pudo persistir referencia diaria FX:', e);
    }

    return prevCloses;
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
    const varBadgeHTML = formatVariationBadge(variacion, false);

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
function createMacroCardHTML(title, value, subtext, badgeText, badgeClass = 'neutral') {
    let icon = '';
    if (badgeText.includes('+') || badgeText.includes('▲')) {
        icon = '<i class="fa-solid fa-caret-up"></i>';
    } else if (badgeText.startsWith('-') || badgeText.includes('▼')) {
        icon = '<i class="fa-solid fa-caret-down"></i>';
    }
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
 * Procesa la serie oficial de Inflación Mensual (INDEC)
 */
function buildInflationCardData(inflacionList) {
    const valid = (Array.isArray(inflacionList) ? inflacionList : [])
        .filter(item => item && item.fecha && isFinite(parseFloat(item.valor)))
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    if (valid.length === 0) {
        return {
            value: '2,7%',
            subtext: 'INDEC (Último disponible)',
            badgeText: '= 0.0 pp',
            badgeClass: 'neutral'
        };
    }

    const latest = valid[valid.length - 1];
    const prev = valid.length >= 2 ? valid[valid.length - 2] : null;

    const currVal = parseFloat(latest.valor);
    const formattedVal = `${currVal.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

    let subtext = 'INDEC';
    const dateParts = String(latest.fecha).split('-');
    if (dateParts.length >= 2) {
        const year = dateParts[0];
        const mIdx = parseInt(dateParts[1], 10) - 1;
        const mesNombre = MESES_CAP[mIdx] || dateParts[1];
        subtext = `INDEC (${mesNombre} ${year})`;
    }

    let badgeText = '= 0.0 pp';
    let badgeClass = 'neutral';
    if (prev) {
        const diff = Number((currVal - parseFloat(prev.valor)).toFixed(1));
        if (diff > 0) {
            badgeText = `▲ +${diff.toFixed(1)} pp`;
            badgeClass = 'down'; // Suba de inflación = alerta roja
        } else if (diff < 0) {
            badgeText = `▼ -${Math.abs(diff).toFixed(1)} pp`;
            badgeClass = 'up';   // Baja de inflación = positivo verde
        }
    }

    return { value: formattedVal, subtext, badgeText, badgeClass };
}

/**
 * Procesa la serie de Riesgo País (JP Morgan EMBI+)
 */
function buildRiesgoPaisCardData(riesgoList) {
    const valid = (Array.isArray(riesgoList) ? riesgoList : [])
        .filter(item => item && item.fecha && isFinite(parseFloat(item.valor)) && parseFloat(item.valor) > 0)
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    if (valid.length === 0) {
        return {
            value: '873 pb',
            subtext: 'JP Morgan EMBI+',
            badgeText: '= 0.0%',
            badgeClass: 'neutral'
        };
    }

    const latest = valid[valid.length - 1];
    const prev = valid.length >= 2 ? valid[valid.length - 2] : null;
    const currVal = parseFloat(latest.valor);
    const formattedVal = `${Math.round(currVal).toLocaleString('es-AR')} pb`;

    let subtext = 'JP Morgan EMBI+';
    const dateParts = String(latest.fecha).split('-');
    if (dateParts.length === 3) {
        subtext = `JP Morgan (${dateParts[2]}/${dateParts[1]})`;
    }

    let badgeText = '= 0.0%';
    let badgeClass = 'neutral';
    if (prev && parseFloat(prev.valor) > 0) {
        const pct = ((currVal - parseFloat(prev.valor)) / parseFloat(prev.valor)) * 100;
        if (pct >= 0.05) {
            badgeText = `▲ +${pct.toFixed(1)}%`;
            badgeClass = 'down'; // Suba de riesgo país = negativo rojo
        } else if (pct <= -0.05) {
            badgeText = `▼ -${Math.abs(pct).toFixed(1)}%`;
            badgeClass = 'up';   // Baja de riesgo país = positivo verde
        }
    }

    return { value: formattedVal, subtext, badgeText, badgeClass };
}

/**
 * Consulta cotizaciones e índices macro en vivo en paralelo y renderiza la barra superior.
 */
export async function fetchMarketData() {
    const container = document.getElementById('market-bar-container');
    const statusTag = document.getElementById('market-status-tag');

    try {
        const [dolaresRes, histDolaresRes, inflacionRes, riesgoRes] = await Promise.allSettled([
            fetch('https://dolarapi.com/v1/dolares'),
            fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares'),
            fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion'),
            fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais')
        ]);

        if (dolaresRes.status !== 'fulfilled' || !dolaresRes.value.ok) {
            throw new Error('Error al conectar con el servicio principal de divisas');
        }

        const dolaresData = await dolaresRes.value.json();
        const histDolaresData = (histDolaresRes.status === 'fulfilled' && histDolaresRes.value.ok)
            ? await histDolaresRes.value.json()
            : [];
        const inflacionData = (inflacionRes.status === 'fulfilled' && inflacionRes.value.ok)
            ? await inflacionRes.value.json()
            : [];
        const riesgoData = (riesgoRes.status === 'fulfilled' && riesgoRes.value.ok)
            ? await riesgoRes.value.json()
            : [];

        const oficial = dolaresData.find(d => d.casa === 'oficial');
        const blue = dolaresData.find(d => d.casa === 'blue');
        const mep = dolaresData.find(d => d.casa === 'bolsa');

        if (mep && mep.venta && parseFloat(mep.venta) > 0) {
            TIPO_CAMBIO_PRESUPUESTO = parseFloat(mep.venta);
            localStorage.setItem('sf_last_mep_fx', String(TIPO_CAMBIO_PRESUPUESTO));
        }

        const prevCloses = resolvePreviousDollarCloses(histDolaresData, { oficial, blue, bolsa: mep });
        const varOficial = computeDailyPctVar(oficial?.venta, prevCloses.oficial);
        const varBlue = computeDailyPctVar(blue?.venta, prevCloses.blue);
        const varMep = computeDailyPctVar(mep?.venta, prevCloses.bolsa);

        const ipcCard = buildInflationCardData(inflacionData);
        const rpCard = buildRiesgoPaisCardData(riesgoData);

        // Persistir snapshot macro completo para modo offline
        try {
            localStorage.setItem('sf_last_macro_snapshot', JSON.stringify({
                oficial,
                blue,
                mep,
                varOficial,
                varBlue,
                varMep,
                ipcCard,
                rpCard
            }));
        } catch (e) {
            // Ignora errores de cuota de almacenamiento
        }

        if (container) {
            container.innerHTML = `
                ${createCurrencyCardHTML('Dólar Oficial', oficial?.compra, oficial?.venta, 'Banco Nación', varOficial)}
                ${createCurrencyCardHTML('Dólar Blue', blue?.compra, blue?.venta, 'Informal', varBlue)}
                ${createCurrencyCardHTML('Dólar MEP', mep?.compra, mep?.venta, 'Bolsa / Cable', varMep)}
                ${createMacroCardHTML('Riesgo País', rpCard.value, rpCard.subtext, rpCard.badgeText, rpCard.badgeClass)}
                ${createMacroCardHTML('Inflación IPC', ipcCard.value, ipcCard.subtext, ipcCard.badgeText, ipcCard.badgeClass)}
            `;
        }

        if (statusTag) {
            statusTag.innerHTML = `<span class="status-pulse-dot"></span> EN VIVO`;
            statusTag.style.borderColor = 'var(--primary)';
            statusTag.style.color = 'var(--primary)';
        }

        window.dispatchEvent(new CustomEvent('market-fx-updated'));

    } catch (error) {
        console.warn('Fallo en la sincronización en vivo del mercado, utilizando último respaldo:', error);

        if (statusTag) {
            statusTag.innerHTML = `<span class="status-pulse-dot" style="background:var(--warning);"></span> MODO RESPALDO`;
            statusTag.style.borderColor = 'var(--warning)';
            statusTag.style.color = 'var(--warning)';
        }

        let snap = null;
        try {
            snap = JSON.parse(localStorage.getItem('sf_last_macro_snapshot') || 'null');
        } catch (e) {
            snap = null;
        }

        if (container) {
            if (snap) {
                container.innerHTML = `
                    ${createCurrencyCardHTML('Dólar Oficial', snap.oficial?.compra, snap.oficial?.venta, 'Banco Nación', snap.varOficial || '= 0.0%')}
                    ${createCurrencyCardHTML('Dólar Blue', snap.blue?.compra, snap.blue?.venta, 'Informal', snap.varBlue || '= 0.0%')}
                    ${createCurrencyCardHTML('Dólar MEP', snap.mep?.compra || TIPO_CAMBIO_PRESUPUESTO, snap.mep?.venta || TIPO_CAMBIO_PRESUPUESTO, 'Bolsa / Cable', snap.varMep || '= 0.0%')}
                    ${createMacroCardHTML('Riesgo País', snap.rpCard?.value || '873 pb', snap.rpCard?.subtext || 'JP Morgan EMBI+', snap.rpCard?.badgeText || '= 0.0%', snap.rpCard?.badgeClass || 'neutral')}
                    ${createMacroCardHTML('Inflación IPC', snap.ipcCard?.value || '2,7%', snap.ipcCard?.subtext || 'INDEC (Respaldo)', snap.ipcCard?.badgeText || '= 0.0 pp', snap.ipcCard?.badgeClass || 'neutral')}
                `;
            } else {
                container.innerHTML = `
                    ${createCurrencyCardHTML('Dólar Oficial', TIPO_CAMBIO_PRESUPUESTO, TIPO_CAMBIO_PRESUPUESTO, 'Banco Nación', '= 0.0%')}
                    ${createCurrencyCardHTML('Dólar Blue', TIPO_CAMBIO_PRESUPUESTO, TIPO_CAMBIO_PRESUPUESTO, 'Informal', '= 0.0%')}
                    ${createCurrencyCardHTML('Dólar MEP', TIPO_CAMBIO_PRESUPUESTO, TIPO_CAMBIO_PRESUPUESTO, 'Bolsa / Cable', '= 0.0%')}
                    ${createMacroCardHTML('Riesgo País', '873 pb', 'JP Morgan EMBI+', '= 0.0%', 'neutral')}
                    ${createMacroCardHTML('Inflación IPC', '2,7%', 'INDEC (Sin conexión)', '= 0.0 pp', 'neutral')}
                `;
            }
        }
    }
}
