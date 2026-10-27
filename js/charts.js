import { state } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

let performanceChart = null;
let historyChart = null;
let currentScaleMode = 'linear';

/**
 * Gráfico Donut de Liquidez Operativa + 5 Cajas Apiladas Verticalmente a la Derecha.
 */
export function renderPortfolioPieChart(balancesARS) {
    const container = document.getElementById('pie-chart-container');
    const legend = document.getElementById('pie-chart-legend');
    if (!container || !legend) return;

    const accounts = [
        { name: 'Santander', color: '#ef4444' },
        { name: 'Efectivo', color: '#10b981' },
        { name: 'Mercado Pago Dante', color: '#3b82f6' },
        { name: 'Mercado Pago Lore', color: '#a855f7' },
        { name: 'Galicia', color: '#f59e0b' }
    ];

    let total = 0;
    const items = accounts.map(acc => {
        const val = Math.max(0, parseFloat(balancesARS[acc.name]) || 0);
        total += val;
        return { ...acc, value: val };
    });

    const size = 280;
    const strokeWidth = 34;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    let circlesHTML = '';
    if (total === 0) {
        circlesHTML = `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="#252538" stroke-width="${strokeWidth}" />`;
    } else {
        items.forEach(item => {
            if (item.value <= 0) return;
            const ratio = item.value / total;
            const strokeDasharray = `${ratio * circumference} ${circumference}`;
            const strokeDashoffset = -accumulatedOffset;
            accumulatedOffset += ratio * circumference;

            circlesHTML += `
                <circle 
                    cx="${size/2}" 
                    cy="${size/2}" 
                    r="${radius}" 
                    fill="none" 
                    stroke="${item.color}" 
                    stroke-width="${strokeWidth}" 
                    stroke-dasharray="${strokeDasharray}" 
                    stroke-dashoffset="${strokeDashoffset}" 
                    style="transition: stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease;"
                />
            `;
        });
    }

    const formattedTotal = `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    container.innerHTML = `
        <svg viewBox="0 0 ${size} ${size}" style="width: 100%; height: 100%; max-width: 360px; max-height: 360px; transform: rotate(-90deg); overflow: visible;">
            ${circlesHTML}
            <text 
                x="${size/2}" 
                y="${size/2}" 
                text-anchor="middle" 
                dominant-baseline="central" 
                fill="#ffffff" 
                font-family="Urbanist, sans-serif" 
                font-weight="800" 
                font-size="20" 
                style="transform: rotate(90deg); transform-origin: ${size/2}px ${size/2}px;"
            >${formattedTotal}</text>
        </svg>
    `;

    // 5 cajas en columna vertical que se adaptan a la altura del contenedor
    legend.innerHTML = items.map(item => `
        <div class="legend-flat-item">
            <span class="label-bank">
                <span class="account-dot" style="background:${item.color};"></span>
                <span>${item.name}</span>
            </span>
            <span class="value-bank">$${item.value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
    `).join('');
}

/**
 * Gráfico Interactivo de Barras RAG (Desempeño por Categoría).
 */
export function renderInteractiveChart(categoriesData) {
    state.cachedCategoriesDataForChart = categoriesData;
    const canvas = document.getElementById('interactive-performance-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (performanceChart) {
        performanceChart.destroy();
    }

    if (!categoriesData || categoriesData.length === 0) {
        return;
    }

    const labels = categoriesData.map(c => c.nombre);
    const presupuestos = categoriesData.map(c => c.meta);
    const reales = categoriesData.map(c => c.gasto);

    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Presupuesto Asignado',
                    data: presupuestos,
                    backgroundColor: 'rgba(59, 130, 246, 0.4)',
                    borderColor: '#3b82f6',
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: 'Gasto Real Ejecutado',
                    data: reales,
                    backgroundColor: categoriesData.map(c => {
                        if (c.estado === 'Target') return 'rgba(16, 185, 129, 0.7)';
                        if (c.estado === 'Riesgo') return 'rgba(245, 158, 11, 0.7)';
                        return 'rgba(239, 68, 68, 0.7)';
                    }),
                    borderColor: categoriesData.map(c => {
                        if (c.estado === 'Target') return '#10b981';
                        if (c.estado === 'Riesgo') return '#f59e0b';
                        return '#ef4444';
                    }),
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 11 } }
                },
                y: {
                    type: currentScaleMode,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 },
                        callback: val => `$${Number(val).toLocaleString('es-AR')}`
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#ffffff', font: { size: 12, weight: '600' } }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy' },
                    zoom: { wheel: { enabled: false }, pinch: { enabled: true }, mode: 'xy' }
                }
            }
        }
    });
}

/**
 * Gráfico Interactivo Multimensual de Evolución Histórica.
 */
export function renderInteractiveHistoryChart(historyData) {
    state.cachedHistoricalDataForChart = historyData;
    const canvas = document.getElementById('interactive-history-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (historyChart) {
        historyChart.destroy();
    }

    if (!historyData || historyData.length === 0) return;

    const labels = historyData.map(h => h.mes);
    const metas = historyData.map(h => h.metaTotal);
    const gastos = historyData.map(h => h.gastoTotal);

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Presupuesto Total ($)',
                    data: metas,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Gasto Real Total ($)',
                    data: gastos,
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0.3,
                    borderDash: [4, 4]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 },
                        callback: val => `$${Number(val).toLocaleString('es-AR')}`
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#ffffff', font: { size: 12, weight: '600' } }
                },
                zoom: {
                    pan: { enabled: true, mode: 'y' },
                    zoom: { wheel: { enabled: false }, pinch: { enabled: true }, mode: 'y' }
                }
            }
        }
    });
}

/**
 * Fichas de Inversiones y Cuentas Comitentes.
 */
export function renderSavingsPatrimonialTab(balancesARS, balancesUSD, brokerARS, brokerUSD) {
    const area = document.getElementById('brokers-cards-area');
    if (!area) return;
    area.innerHTML = '';

    const brokers = ['Mercado Pago Dante', 'Mercado Pago Lore', 'IOL Invertir Online', 'Balanz Capital'];

    brokers.forEach(b => {
        const saldoARS = balancesARS[b] || 0;
        const saldoUSD = balancesUSD[b] || 0;
        const rendARS = brokerARS[b] || 0;
        const rendUSD = brokerUSD[b] || 0;

        const totalEquivARS = saldoARS + (saldoUSD * TIPO_CAMBIO_PRESUPUESTO);

        area.innerHTML += `
            <div class="broker-card">
                <div class="broker-title"><i class="fa-solid fa-vault"></i> ${b}</div>
                <div style="font-size: 19px; font-weight: 700; font-family: 'Urbanist'; color: #fff;">
                    $${Math.round(totalEquivARS).toLocaleString('es-AR')}
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 8px;">
                    <span>ARS: $${Math.round(saldoARS).toLocaleString('es-AR')}</span>
                    <span>USD: u$d ${saldoUSD.toFixed(2)}</span>
                </div>
                <div style="font-size: 11px; color: var(--primary); font-weight: 600;">
                    Rendimiento Mes: +$${Math.round(rendARS).toLocaleString('es-AR')} ${rendUSD > 0 ? `(+u$d ${rendUSD.toFixed(2)})` : ''}
                </div>
            </div>
        `;
    });
}

// CONTROLES DE ZOOM Y ESCALA
export function toggleInteractiveScale() {
    currentScaleMode = (currentScaleMode === 'linear') ? 'logarithmic' : 'linear';
    const lbl = document.getElementById('lbl-scale-mode');
    if (lbl) lbl.innerText = currentScaleMode === 'linear' ? 'Lineal' : 'Logarítmica';
    if (performanceChart) {
        performanceChart.options.scales.y.type = currentScaleMode;
        performanceChart.update();
    }
}

export function resetInteractiveZoom() {
    if (performanceChart) performanceChart.resetZoom();
}

export function resetInteractiveHistoryZoom() {
    if (historyChart) historyChart.resetZoom();
}

export function zoomPerformanceChart(axis, factor) {
    if (performanceChart) {
        if (axis === 'x') performanceChart.zoom({ x: factor });
        else performanceChart.zoom({ y: factor });
    }
}

export function zoomHistoryChart(factor) {
    if (historyChart) {
        historyChart.zoom({ y: factor });
    }
}
