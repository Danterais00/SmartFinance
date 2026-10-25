export const SUPABASE_URL = "https://uszneehbjssjractaleh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzem5lZWhianNzanJhY3RhbGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjE3NzMsImV4cCI6MjA5ODMzNzc3M30.DGRmWfXWcqgfA7FrFuCrBBs9hSLwSqSYyDej4_vaxi4";

export const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export let TIPO_CAMBIO_PRESUPUESTO = 1450;
export function setTipoCambioPresupuesto(valor) {
    TIPO_CAMBIO_PRESUPUESTO = valor;
}

const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function renderVarBadge(pct, invertSense = false, isAbsoluteDif = false) {
    if (pct === undefined || pct === null || isNaN(pct)) return '';
    if (pct === 0) return `<span class="var-badge neutral">= 0.0${isAbsoluteDif ? '' : '%'}</span>`;
    const isPositive = pct > 0;
    const isGood = invertSense ? !isPositive : isPositive;
    const cssClass = isGood ? 'up' : 'down';
    const icon = isPositive ? '<i class="fa-solid fa-caret-up"></i>' : '<i class="fa-solid fa-caret-down"></i>';
    const sign = isPositive ? '+' : '';
    const sym = isAbsoluteDif ? '' : '%';
    return `<span class="var-badge ${cssClass}">${icon}${sign}${pct.toFixed(1)}${sym}</span>`;
}

function renderMarketBar(oficial, blue, mep, riesgo, inf, isLive) {
    const container = document.getElementById('market-bar-container');
    const statusTag = document.getElementById('market-status-tag');
    if (!container) return;

    if (statusTag) {
        if (isLive) {
            statusTag.innerText = "🟢 EN VIVO";
            statusTag.style.color = "var(--primary)";
            statusTag.style.borderColor = "var(--primary)";
            statusTag.style.background = "rgba(16, 185, 129, 0.1)";
        } else {
            statusTag.innerText = "⚠️ MODO OFFLINE";
            statusTag.style.color = "var(--warning)";
            statusTag.style.borderColor = "var(--warning)";
            statusTag.style.background = "rgba(245, 158, 11, 0.1)";
        }
    }

    const fmt = (num) => num ? '$' + num.toLocaleString('es-AR') : 'N/D';

    container.innerHTML = `
        <div class="market-pill">
            <span class="title">Dólar Oficial</span>
            <div class="val-group">
                <div class="val-row"><span class="lbl">Compra</span><div class="num-box"><span class="num">${fmt(oficial.compra)}</span> ${renderVarBadge(oficial.compraVar)}</div></div>
                <div class="val-row"><span class="lbl">Venta</span><div class="num-box"><span class="num">${fmt(oficial.venta)}</span> ${renderVarBadge(oficial.ventaVar)}</div></div>
            </div>
            <span class="sub">Banco Nación</span>
        </div>
        <div class="market-pill">
            <span class="title">Dólar Blue</span>
            <div class="val-group">
                <div class="val-row"><span class="lbl">Compra</span><div class="num-box"><span class="num">${fmt(blue.compra)}</span> ${renderVarBadge(blue.compraVar)}</div></div>
                <div class="val-row"><span class="lbl">Venta</span><div class="num-box"><span class="num">${fmt(blue.venta)}</span> ${renderVarBadge(blue.ventaVar)}</div></div>
            </div>
            <span class="sub">Informal</span>
        </div>
        <div class="market-pill">
            <span class="title">Dólar MEP</span>
            <div class="val-group">
                <div class="val-row"><span class="lbl">Compra</span><div class="num-box"><span class="num">${fmt(mep.compra)}</span> ${renderVarBadge(mep.compraVar)}</div></div>
                <div class="val-row"><span class="lbl">Venta</span><div class="num-box"><span class="num">${fmt(mep.venta)}</span> ${renderVarBadge(mep.ventaVar)}</div></div>
            </div>
            <span class="sub">Bolsa / Cable</span>
        </div>
        <div class="market-pill">
            <span class="title">Riesgo País</span>
            <div class="val-group" style="margin: 6px 0;">
                <div class="num-box" style="justify-content: space-between; width:100%;">
                    <span class="num" style="font-size:18px;">${riesgo.valor ? riesgo.valor.toLocaleString('es-AR') + ' pb' : 'N/D'}</span>
                    ${renderVarBadge(riesgo.varPct, true)}
                </div>
            </div>
            <span class="sub">JP Morgan EMBI+</span>
        </div>
        <div class="market-pill full-mobile">
            <span class="title">Inflación IPC</span>
            <div class="val-group" style="margin: 6px 0;">
                <div class="num-box" style="justify-content: space-between; width:100%;">
                    <span class="num" style="font-size:18px;">${inf.valor ? inf.valor.toLocaleString('es-AR') + '%' : 'N/D'}</span>
                    ${renderVarBadge(inf.varPct, true, true)}
                </div>
            </div>
            <span class="sub">INDEC (${inf.mesStr})</span>
        </div>
    `;
}

export async function fetchMarketData(onDataLoaded) {
    let mepObj = { compra: 0, venta: 1450, compraVar: 0, ventaVar: 0 };
    let oficialObj = { compra: 0, venta: 0, compraVar: 0, ventaVar: 0 };
    let blueObj = { compra: 0, venta: 0, compraVar: 0, ventaVar: 0 };
    let riesgoObj = { valor: 0, varPct: 0 };
    let infObj = { valor: 0, varPct: 0, mesStr: "Mensual" };
    let isLive = false;

    try {
        const [dolaresRes, riesgoRes, infRes, histOficial, histBlue, histMep] = await Promise.all([
            fetch('https://dolarapi.com/v1/dolares').then(r => r.json()).catch(() => null),
            fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais').then(r => r.json()).catch(() => null),
            fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion').then(r => r.json()).catch(() => null),
            fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial').then(r => r.json()).catch(() => null),
            fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/blue').then(r => r.json()).catch(() => null),
            fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa').then(r => r.json()).catch(() => null)
        ]);

        if (dolaresRes && Array.isArray(dolaresRes)) {
            const mep = dolaresRes.find(d => d.casa === 'bolsa');
            const oficial = dolaresRes.find(d => d.casa === 'oficial');
            const blue = dolaresRes.find(d => d.casa === 'blue');

            if (mep) {
                setTipoCambioPresupuesto(mep.venta);
                mepObj = { compra: mep.compra, venta: mep.venta, compraVar: 0, ventaVar: 0 };
            }
            if (oficial) oficialObj = { compra: oficial.compra, venta: oficial.venta, compraVar: 0, ventaVar: 0 };
            if (blue) blueObj = { compra: blue.compra, venta: blue.venta, compraVar: 0, ventaVar: 0 };
            isLive = true;
        }

        const calcVar = (hist, currentVal, type = 'venta') => {
            if (!hist || !Array.isArray(hist) || hist.length < 2) return 0;
            const prev = hist[hist.length - 2];
            const prevVal = prev ? (prev[type] || prev.valor || prev.value) : 0;
            if (!prevVal || prevVal === 0) return 0;
            return ((currentVal - prevVal) / prevVal) * 100;
        };

        if (histOficial) {
            oficialObj.compraVar = calcVar(histOficial, oficialObj.compra, 'compra');
            oficialObj.ventaVar = calcVar(histOficial, oficialObj.venta, 'venta');
        }
        if (histBlue) {
            blueObj.compraVar = calcVar(histBlue, blueObj.compra, 'compra');
            blueObj.ventaVar = calcVar(histBlue, blueObj.venta, 'venta');
        }
        if (histMep) {
            mepObj.compraVar = calcVar(histMep, mepObj.compra, 'compra');
            mepObj.ventaVar = calcVar(histMep, mepObj.venta, 'venta');
        }

        if (riesgoRes && Array.isArray(riesgoRes) && riesgoRes.length > 0) {
            const lastRiesgo = riesgoRes[riesgoRes.length - 1];
            const prevRiesgo = riesgoRes.length > 1 ? riesgoRes[riesgoRes.length - 2] : null;
            const valR = lastRiesgo.valor || lastRiesgo.value || 0;
            const valPrevR = prevRiesgo ? (prevRiesgo.valor || prevRiesgo.value || 0) : 0;
            let rVar = 0;
            if (valPrevR > 0) rVar = ((valR - valPrevR) / valPrevR) * 100;
            riesgoObj = { valor: valR, varPct: rVar };
        }

        if (infRes && Array.isArray(infRes) && infRes.length > 0) {
            const ult = infRes[infRes.length - 1];
            const prev = infRes.length > 1 ? infRes[infRes.length - 2] : null;
            const vUlt = ult.valor || 0;
            const vPrev = prev ? (prev.valor || 0) : 0;
            let dif = 0;
            if (vPrev > 0) dif = vUlt - vPrev;
            let mStr = "Mensual";
            if (ult.fecha) {
                try {
                    const d = new Date(ult.fecha + "T00:00:00");
                    mStr = `${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
                } catch (e) {}
            }
            infObj = { valor: vUlt, varPct: dif, mesStr: mStr };
        }

        renderMarketBar(oficialObj, blueObj, mepObj, riesgoObj, infObj, isLive);
        if (onDataLoaded) onDataLoaded();
    } catch (error) {
        console.error("Error obteniendo datos de mercado", error);
        renderMarketBar(oficialObj, blueObj, mepObj, riesgoObj, infObj, false);
    }
}
