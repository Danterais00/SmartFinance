export const SUPABASE_URL = "https://uszneehbjssjractaleh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzem5lZWhianNzanJhY3RhbGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjE3NzMsImV4cCI6MjA5ODMzNzc3M30.DGRmWfXWcqgfA7FrFuCrBBs9hSLwSqSYyDej4_vaxi4";

export const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tipo de cambio dinámico exportado con live-binding
export let TIPO_CAMBIO_PRESUPUESTO = 1200;

export function setTipoCambioPresupuesto(nuevoValor) {
    if (typeof nuevoValor === 'number' && nuevoValor > 0) {
        TIPO_CAMBIO_PRESUPUESTO = nuevoValor;
    }
}

export async function fetchMarketData() {
    const container = document.getElementById('market-bar-container');
    const statusTag = document.getElementById('market-status-tag');
    if (!container) return;

    // Valores base y de respaldo idénticos a tu captura
    let rpValor = 707;
    let rpVar = "+0.4%";
    let infValor = "1,9%";
    let infVar = "+0.2";
    let infPeriodo = "Septiembre 2026";

    let dolares = [
        { casa: 'oficial', nombre: 'OFICIAL', compra: 1500, venta: 1550, subtitulo: 'Banco Nación' },
        { casa: 'blue', nombre: 'BLUE', compra: 1545, venta: 1565, subtitulo: 'Informal' },
        { casa: 'bolsa', nombre: 'MEP', compra: 1557.4, venta: 1563.9, subtitulo: 'Bolsa / Cable' }
    ];

    try {
        if (statusTag) {
            statusTag.innerHTML = `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--warning);"></span> ACTUALIZANDO`;
            statusTag.style.borderColor = "var(--warning)";
            statusTag.style.color = "var(--warning)";
        }

        const [dolarRes, rpRes, infRes] = await Promise.allSettled([
            fetch('https://dolarapi.com/v1/dolares'),
            fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo'),
            fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion/ultimo')
        ]);

        // 1. Procesar Dólares en vivo
        if (dolarRes.status === 'fulfilled' && dolarRes.value.ok) {
            const dataDolar = await dolarRes.value.json();
            const oficialApi = dataDolar.find(d => d.casa === 'oficial');
            const blueApi = dataDolar.find(d => d.casa === 'blue');
            const mepApi = dataDolar.find(d => d.casa === 'bolsa');

            if (oficialApi) dolares[0] = { casa: 'oficial', nombre: 'OFICIAL', compra: oficialApi.compra, venta: oficialApi.venta, subtitulo: 'Banco Nación' };
            if (blueApi) dolares[1] = { casa: 'blue', nombre: 'BLUE', compra: blueApi.compra, venta: blueApi.venta, subtitulo: 'Informal' };
            if (mepApi) {
                dolares[2] = { casa: 'bolsa', nombre: 'MEP', compra: mepApi.compra, venta: mepApi.venta, subtitulo: 'Bolsa / Cable' };
                setTipoCambioPresupuesto(Math.round(mepApi.venta));
            }
        }

        // 2. Procesar Riesgo País en vivo
        if (rpRes.status === 'fulfilled' && rpRes.value.ok) {
            const dataRp = await rpRes.value.json();
            if (dataRp && dataRp.valor) {
                rpValor = Math.round(dataRp.valor);
            }
        }

        // 3. Procesar Inflación IPC en vivo
        if (infRes.status === 'fulfilled' && infRes.value.ok) {
            const dataInf = await infRes.value.json();
            if (dataInf && dataInf.valor) {
                infValor = `${Number(dataInf.valor).toLocaleString('es-AR')}%`;
                if (dataInf.fecha) {
                    const [y, m] = dataInf.fecha.split('-');
                    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                    infPeriodo = `${meses[parseInt(m, 10) - 1]} ${y}`;
                }
            }
        }

        if (statusTag) {
            statusTag.innerHTML = `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--primary);"></span> EN VIVO`;
            statusTag.style.borderColor = "var(--primary)";
            statusTag.style.color = "var(--primary)";
        }

        window.dispatchEvent(new CustomEvent('market-fx-updated'));

    } catch (err) {
        console.warn("Fallo parcial en consulta macroeconómica, utilizando valores de respaldo:", err);
        if (statusTag) {
            statusTag.innerHTML = `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--text-muted);"></span> RESPALDO`;
            statusTag.style.borderColor = "var(--border-color)";
            statusTag.style.color = "var(--text-muted)";
        }
    }

    // Renderizar las 5 tarjetas exactas de la barra macroeconómica
    const formatNumber = (num) => Number(num).toLocaleString('es-AR', { minimumFractionDigits: (num % 1 !== 0 ? 1 : 0), maximumFractionDigits: 2 });

    let htmlCards = "";

    // Tarjetas 1, 2 y 3: Dólares
    dolares.forEach(item => {
        htmlCards += `
            <div class="market-pill">
                <div class="title">Dólar ${item.nombre}</div>
                <div class="val-group">
                    <div class="val-row">
                        <span class="lbl">Compra</span>
                        <div class="num-box">
                            <span class="num">$${formatNumber(item.compra)}</span>
                            <span class="var-badge neutral">= 0.0%</span>
                        </div>
                    </div>
                    <div class="val-row">
                        <span class="lbl">Venta</span>
                        <div class="num-box">
                            <span class="num">$${formatNumber(item.venta)}</span>
                            <span class="var-badge neutral">= 0.0%</span>
                        </div>
                    </div>
                </div>
                <div class="sub">${item.subtitulo}</div>
            </div>
        `;
    });

    // Tarjeta 4: Riesgo País
    htmlCards += `
        <div class="market-pill">
            <div class="title">Riesgo País</div>
            <div class="val-group" style="margin: 6px 0 3px 0;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span class="num" style="font-size: 20px; font-weight: 700; font-family: 'Urbanist'; color: #fff;">${rpValor} pb</span>
                    <span class="var-badge down" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-size: 10px; padding: 2px 6px;">▲ ${rpVar}</span>
                </div>
            </div>
            <div class="sub">JP Morgan EMBI+</div>
        </div>
    `;

    // Tarjeta 5: Inflación IPC
    htmlCards += `
        <div class="market-pill">
            <div class="title">Inflación IPC</div>
            <div class="val-group" style="margin: 6px 0 3px 0;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span class="num" style="font-size: 20px; font-weight: 700; font-family: 'Urbanist'; color: #fff;">${infValor}</span>
                    <span class="var-badge down" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-size: 10px; padding: 2px 6px;">▲ ${infVar}</span>
                </div>
            </div>
            <div class="sub">INDEC (${infPeriodo})</div>
        </div>
    `;

    container.innerHTML = htmlCards;
}
