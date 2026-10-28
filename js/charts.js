import { state, CUENTAS_COMITENTES } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

let performanceChart = null;
let historyChart = null;
let currentScaleMode = 'linear';

/**
 * Control de Zoom Desacoplado por Zonas de Eje (Rueda del ratón y arrastre directo)
 */
function setupDecoupledZoom(canvasId, getChartInstance, isLogScale = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || canvas.dataset.zoomBound === 'true') return;

    let isDragging = false;
    let dragAxis = null;
    let lastY = 0; 
    let lastX = 0;

    const getAxisZone = (clientX, clientY) => {
        const chart = getChartInstance();
        if (!chart || !chart.chartArea) return null;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const ca = chart.chartArea;
        if (x <= ca.left) return 'y';
        if (y >= ca.bottom) return 'x';
        return 'chart';
    };

    const updateZoomDirection = (clientX, clientY) => {
        const chart = getChartInstance();
        if (!chart) return;
        const zone = getAxisZone(clientX, clientY);
        if (zone === 'y') {
            if (chart.options.plugins?.zoom?.zoom) chart.options.plugins.zoom.zoom.mode = 'y';
            canvas.style.cursor = 'ns-resize';
        } else if (zone === 'x') {
            if (chart.options.plugins?.zoom?.zoom) chart.options.plugins.zoom.zoom.mode = 'x';
            canvas.style.cursor = 'ew-resize';
        } else {
            if (chart.options.plugins?.zoom?.zoom) chart.options.plugins.zoom.zoom.mode = 'xy';
            canvas.style.cursor = 'default';
        }
    };

    canvas.addEventListener('wheel', (e) => {
        updateZoomDirection(e.clientX, e.clientY);
        const chart = getChartInstance();
        if (chart) {
            chart.options.scales.y.min = (isLogScale && currentScaleMode === 'logarithmic') ? 500 : 0;
        }
    }, { capture: true, passive: true });

    canvas.addEventListener('mousedown', (e) => {
        const chart = getChartInstance();
        if (!chart) return;
        const zone = getAxisZone(e.clientX, e.clientY);
        const isRightClick = (e.button === 2);
        
        if (zone === 'y' || isRightClick) {
            isDragging = true; 
            dragAxis = 'y';
        } else if (zone === 'x') {
            isDragging = true; 
            dragAxis = 'x';
        }

        if (isDragging) {
            const rect = canvas.getBoundingClientRect();
            lastY = e.clientY - rect.top;
            lastX = e.clientX - rect.left;
            if (e.cancelable && zone !== 'chart') e.preventDefault();
        }
    });

    window.addEventListener('mousemove', (e) => {
        const chart = getChartInstance();
        if (!chart) return;
        const rect = canvas.getBoundingClientRect();
        const currentY = e.clientY - rect.top;
        const currentX = e.clientX - rect.left;

        if (isDragging) {
            if (dragAxis === 'y') {
                const delta = currentY - lastY;
                const factor = delta > 0 ? 1.05 : 0.95;
                const pMin = (isLogScale && currentScaleMode === 'logarithmic') ? 500 : 0;
                let curMax = (chart.options.scales.y.max || chart.scales.y.max);
                let newMax = curMax * factor;
                if (newMax <= pMin + 100) newMax = pMin + 100;
                
                chart.options.scales.y.min = pMin;
                chart.options.scales.y.max = newMax;
                chart.update('none');
                lastY = currentY;
            } else if (dragAxis === 'x') {
                const delta = currentX - lastX;
                const shift = Math.round(-delta / 15);
                if (shift !== 0) {
                    let xScale = chart.scales.x;
                    let min = chart.options.scales.x.min ?? xScale.min;
                    let max = chart.options.scales.x.max ?? xScale.max;
                    let newMin = min + shift;
                    let newMax = max - shift;
                    if (newMax <= newMin) newMax = newMin + 1;
                    const maxLimit = chart.data.labels.length - 1;
                    chart.options.scales.x.min = Math.max(0, newMin);
                    chart.options.scales.x.max = Math.min(maxLimit, newMax);
                    chart.update('none');
                    lastX = currentX;
                }
            }
            if (e.cancelable) e.preventDefault();
        } else {
            updateZoomDirection(e.clientX, e.clientY);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragAxis = null;
            canvas.style.cursor = 'default';
        }
    });

    canvas.dataset.zoomBound = 'true';
}

/**
 * Gráfico Donut de Liquidez Operativa + Cajas en columna vertical a la derecha.
 */
export function renderPortfolioPieChart(balancesARS, balancesUSD = {}, fxRate = TIPO_CAMBIO_PRESUPUESTO) {
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
        const valARS = Math.max(0, parseFloat(balancesARS[acc.name]) || 0);
        const valUSD = Math.max(0, parseFloat(balancesUSD[acc.name]) || 0);
        const valTotalEquiv = valARS + (valUSD * (fxRate || TIPO_CAMBIO_PRESUPUESTO));
        
        total += valTotalEquiv;
        return { 
            ...acc, 
            value: valTotalEquiv,
            valARS,
            valUSD
        };
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

    const formattedTotal = `$${Math.round(total).toLocaleString('es-AR')}`;

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

    legend.innerHTML = items.map(item => {
        const usdBadge = item.valUSD > 0 
            ? `<span style="font-size:10px; color:var(--text-muted); margin-left:4px; font-weight:500;">(u$d ${item.valUSD.toFixed(2)})</span>` 
            : '';

        return `
            <div class="legend-flat-item">
                <span class="label-bank">
                    <span class="account-dot" style="background:${item.color};"></span>
                    <span>${item.name}</span>
                </span>
                <span class="value-bank">
                    $${item.value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    ${usdBadge}
                </span>
            </div>
        `;
    }).join('');
}

/**
 * Fichas de Inversiones: Basadas estrictamente en CUENTAS_COMITENTES reales.
 */
export function renderSavingsPatrimonialTab(balancesARS, balancesUSD, brokerARS, brokerUSD) {
    const area = document.getElementById('brokers-cards-area');
    if (!area) return;
    area.innerHTML = '';

    CUENTAS_COMITENTES.forEach(b => {
        let saldoARS = balancesARS[b] || 0;
        let saldoUSD = balancesUSD[b] || 0;
        let rendARS = brokerARS[b] || 0;
        let rendUSD = brokerUSD[b] || 0;

        if (b === 'Balanz' && !saldoARS && !saldoUSD) {
            saldoARS = (balancesARS['Balanz Capital'] || 0) || saldoARS;
            saldoUSD = (balancesUSD['Balanz Capital'] || 0) || saldoUSD;
            rendARS = (brokerARS['Balanz Capital'] || 0) || rendARS;
            rendUSD = (brokerUSD['Balanz Capital'] || 0) || rendUSD;
        }

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

/**
 * GRÁFICO 1: Desempeño por Categoría (Puntos Desacoplados / Scatter, Orden Alfabético Estricto A-Z)
 */
export function renderInteractiveChart(categoriesMes) {
    // Asegura orden alfabético estricto de A a Z
    const sortedCategories = [...(categoriesMes || [])].sort((a, b) => 
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );

    state.cachedCategoriesDataForChart = sortedCategories;
    const canvas = document.getElementById('interactive-performance-canvas');
    if (!canvas) return;

    if (performanceChart) {
        performanceChart.destroy();
    }

    if (sortedCategories.length === 0) return;

    const isLog = (currentScaleMode === 'logarithmic');
    const labels = sortedCategories.map(c => c.nombre);

    const metaPoints = sortedCategories.map(c => ({
        x: c.nombre,
        y: (isLog && c.meta <= 0) ? 500 : c.meta,
        realVal: c.meta,
        estado: c.estado
    }));

    const gastoPoints = sortedCategories.map(c => ({
        x: c.nombre,
        y: (isLog && c.gasto <= 0) ? 500 : c.gasto,
        realVal: c.gasto,
        estado: c.estado
    }));

    const ctx = canvas.getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Presupuesto Meta ($)',
                    data: metaPoints,
                    borderColor: '#3b82f6',
                    backgroundColor: '#3b82f6',
                    showLine: false,
                    pointRadius: 5.5,
                    pointHoverRadius: 8
                },
                {
                    label: 'Gasto Real ($)',
                    data: gastoPoints,
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    showLine: false,
                    pointRadius: 5.5,
                    pointStyle: 'rectRot',
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af',
                        autoSkip: false,
                        maxRotation: 90,
                        minRotation: 45,
                        font: { size: 9, weight: '600' }
                    },
                    grid: { color: 'rgba(37, 37, 56, 0.6)' }
                },
                y: {
                    type: currentScaleMode,
                    min: isLog ? 500 : 0,
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 10 },
                        callback: function(val) {
                            if (isLog && val === 500) return '$0 (Piso)';
                            return '$' + Number(val).toLocaleString('es-AR');
                        }
                    },
                    grid: { color: 'rgba(37, 37, 56, 0.6)' }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f3f4f6',
                        font: { family: 'Inter', weight: '600', size: 11 },
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 31, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#252538',
                    borderWidth: 1,
                    padding: 12,
                    titleFont: { size: 13, weight: '700' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function(context) {
                            const raw = context.raw;
                            const label = context.dataset.label || '';
                            const val = (raw && raw.realVal !== undefined) ? raw.realVal : context.parsed.y;
                            return ` ${label}: $${val.toLocaleString('es-AR')}`;
                        },
                        afterBody: function(context) {
                            if (!context || context.length === 0) return '';
                            const raw = context[0].raw;
                            return ` Semáforo: ${raw.estado || 'N/D'}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy', threshold: 5 },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' },
                    limits: { y: { min: isLog ? 500 : 0 } }
                }
            }
        }
    });

    setupDecoupledZoom('interactive-performance-canvas', () => performanceChart, true);
}

/**
 * GRÁFICO 2: Tendencia Histórica Mes a Mes (Líneas sólidas originales, orden cronológico)
 */
export function renderInteractiveHistoryChart(historicalList) {
    state.cachedHistoricalDataForChart = historicalList || [];
    const canvas = document.getElementById('interactive-history-canvas');
    if (!canvas) return;

    if (historyChart) {
        historyChart.destroy();
    }

    if (!historicalList || historicalList.length === 0) return;

    const labels = historicalList.map(h => h.mes);
    const gastos = historicalList.map(h => h.gastoTotal);
    const presupuestos = historicalList.map(h => h.metaTotal);

    const ctx = canvas.getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Gasto Total ($)',
                    data: gastos,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.25,
                    pointRadius: 6,
                    pointHoverRadius: 9,
                    pointBackgroundColor: '#ef4444'
                },
                {
                    label: 'Presupuesto Total ($)',
                    data: presupuestos,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    fill: true,
                    tension: 0.25,
                    pointRadius: 6,
                    pointHoverRadius: 9,
                    pointBackgroundColor: '#3b82f6'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 10, weight: '600' }
                    },
                    grid: { color: 'rgba(37, 37, 56, 0.6)' }
                },
                y: {
                    min: 0,
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 10 },
                        callback: function(val) {
                            return '$' + Number(val).toLocaleString('es-AR');
                        }
                    },
                    grid: { color: 'rgba(37, 37, 56, 0.6)' }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f3f4f6',
                        font: { family: 'Inter', weight: '600', size: 11 },
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 31, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#252538',
                    borderWidth: 1,
                    padding: 12,
                    titleFont: { size: 13, weight: '700' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: $${Number(context.parsed.y).toLocaleString('es-AR')}`;
                        },
                        afterBody: function(contexts) {
                            if (!contexts || contexts.length < 2) return '';
                            const gasto = contexts[0].parsed.y;
                            const meta = contexts[1].parsed.y;
                            const dif = meta - gasto;
                            const signo = dif >= 0 ? '🟢 Ahorro neto' : '🔴 Déficit neto';
                            return ` ${signo}: $${Math.abs(dif).toLocaleString('es-AR')}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x', threshold: 5 },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                    limits: { y: { min: 0 } }
                }
            }
        }
    });

    setupDecoupledZoom('interactive-history-canvas', () => historyChart, false);
}

export function toggleInteractiveScale() {
    currentScaleMode = (currentScaleMode === 'linear') ? 'logarithmic' : 'linear';
    const lbl = document.getElementById('lbl-scale-mode');
    if (lbl) {
        lbl.innerText = (currentScaleMode === 'linear') ? 'Lineal' : 'Logarítmica';
        lbl.style.color = (currentScaleMode === 'linear') ? 'var(--blue)' : 'var(--warning)';
    }
    renderInteractiveChart(state.cachedCategoriesDataForChart);
}

export function resetInteractiveZoom() {
    if (performanceChart) {
        delete performanceChart.options.scales.x.min;
        delete performanceChart.options.scales.x.max;
        delete performanceChart.options.scales.y.max;
        performanceChart.options.scales.y.min = (currentScaleMode === 'logarithmic') ? 500 : 0;
        performanceChart.resetZoom();
        performanceChart.update();
    }
}

export function resetInteractiveHistoryZoom() {
    if (historyChart) {
        delete historyChart.options.scales.x.min;
        delete historyChart.options.scales.x.max;
        delete historyChart.options.scales.y.max;
        historyChart.options.scales.y.min = 0;
        historyChart.resetZoom();
        historyChart.update();
    }
}

export function zoomPerformanceChart(axis, factor) {
    if (performanceChart) {
        if (axis === 'x') {
            performanceChart.zoom({ x: factor });
        } else {
            performanceChart.zoom({ y: factor });
        }
    }
}

export function zoomHistoryChart(factor) {
    if (historyChart) {
        historyChart.zoom({ y: factor });
    }
}
