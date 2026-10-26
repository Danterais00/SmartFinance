// =========================================================================
// PEGA AQUÍ TUS DOS LÍNEAS REALES RECUPERADAS DEL HISTORIAL DE GITHUB:
export const SUPABASE_URL = "https://uszneehbjssjractaleh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzem5lZWhianNzanJhY3RhbGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjE3NzMsImV4cCI6MjA5ODMzNzc3M30.DGRmWfXWcqgfA7FrFuCrBBs9hSLwSqSYyDej4_vaxi4";
// =========================================================================

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

    try {
        if (statusTag) {
            statusTag.innerText = "Sincronizando...";
            statusTag.style.color = "var(--warning)";
        }

        const res = await fetch('https://dolarapi.com/v1/dolares');
        if (!res.ok) throw new Error("Fallo en la red");
        const data = await res.json();

        container.innerHTML = "";
        
        // Sincronizar dinámicamente con Dólar MEP (Bolsa) o Blue
        const mepObj = data.find(d => d.casa === 'bolsa') || data.find(d => d.casa === 'blue');
        if (mepObj && mepObj.venta) {
            setTipoCambioPresupuesto(Math.round(mepObj.venta));
        }

        data.forEach(item => {
            if (['oficial', 'blue', 'bolsa', 'contadoconliqui', 'tarjeta'].includes(item.casa)) {
                const nombre = item.nombre === 'Bolsa' ? 'MEP' : (item.nombre === 'Contado con liquidación' ? 'CCL' : item.nombre);
                container.innerHTML += `
                    <div class="market-pill">
                        <div class="title">Dólar ${nombre}</div>
                        <div class="val-group">
                            <div class="val-row">
                                <span class="lbl">Compra</span>
                                <span class="num">$${Number(item.compra).toLocaleString('es-AR')}</span>
                            </div>
                            <div class="val-row">
                                <span class="lbl">Venta</span>
                                <span class="num">$${Number(item.venta).toLocaleString('es-AR')}</span>
                            </div>
                        </div>
                        <div class="sub">Act. ${item.fechaActualizacion ? item.fechaActualizacion.substring(11, 16) : 'Hoy'} hs</div>
                    </div>
                `;
            }
        });

        if (statusTag) {
            statusTag.innerText = `En Vivo (TC Conv: $${TIPO_CAMBIO_PRESUPUESTO})`;
            statusTag.style.color = "var(--primary)";
        }

        window.dispatchEvent(new CustomEvent('market-fx-updated'));

    } catch (err) {
        console.warn("No se pudieron cargar variables macroeconómicas:", err);
        if (statusTag) {
            statusTag.innerText = `TC Respaldo ($${TIPO_CAMBIO_PRESUPUESTO})`;
            statusTag.style.color = "var(--text-muted)";
        }
    }
}
