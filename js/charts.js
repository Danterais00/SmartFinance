import { state, CUENTAS_COMITENTES, CUENTAS_OPERATIVAS } from './state.js';

let interactiveChartInstance = null;
let interactiveHistoryChartInstance = null;
let interactiveScaleMode = 'linear';

export function getInteractiveScaleMode() {
    return interactiveScaleMode;
}

export function toggleInteractiveScale() {
    interactiveScaleMode = (interactiveScaleMode === 'linear') ? 'logarithmic' : 'linear';
    const lbl = document.getElementById('lbl-scale-mode');
    if (lbl) {
        lbl.innerText = (interactiveScaleMode === 'linear') ? 'Lineal' : 'Logarítmica';
        lbl.style.color = (interactiveScaleMode === 'linear') ? 'var(--blue)' : 'var(--warning)';
    }
    renderInteractiveChart(state.cachedCategoriesDataForChart);
}

export function resetInteractiveZoom() {
    if (interactiveChartInstance) {
        delete interactiveChartInstance.options.scales.x.min;
        delete interactiveChartInstance.options.scales.x.max;
        delete interactiveChartInstance.options.scales.y.max;
        interactiveChartInstance.options.scales.y.min = (interactiveScaleMode === 'logarithmic') ? 500 : 0;
        interactiveChartInstance.resetZoom();
        interactiveChartInstance.update();
    }
}

export function resetInteractiveHistoryZoom() {
    if (interactiveHistoryChartInstance) {
        delete interactiveHistoryChartInstance.options.scales.x.min;
        delete interactiveHistoryChartInstance.options.scales.x.max;
        delete interactiveHistoryChartInstance.options.scales.y.max;
        interactiveHistoryChartInstance.options.scales.y.min = 0;
        interactiveHistoryChartInstance.resetZoom();
        interactiveHistoryChartInstance.update();
    }
}

// Control discreto de Zoom para Pantallas Táctiles Móviles
export function zoomPerformanceChart(axis, factor) {
    if (!interactiveChartInstance) return;
    const chart = interactiveChartInstance;

    if (axis === 'y') {
        const isLog = (interactiveScaleMode === 'logarithmic');
        const pMin = isLog ? 500 : 0;
        let curMax = chart.options.scales.y.max ?? chart.scales.y.max;
        let newMax = curMax * factor;
        if (newMax <= pMin + 200) newMax = pMin + 200;

        chart.options.scales.y.min = pMin;
        chart.options.scales.y.max = newMax;
        chart.update('none');
    } else if (axis === 'x') {
        let xScale = chart.scales.x;
        let min = chart.options.scales.x.min ?? xScale.min;
        let max = chart.options.scales.x.max ?? xScale.max;
        let span = max - min;
        let change = Math.round(span * (1 - factor) / 2);
        if (change === 0) change = (factor < 1 ? 1 : -1);

        let newMin = min + change;
        let newMax = max - change;
        const maxLimit = chart.data.labels.length - 1;

        if (newMin < 0) newMin = 0;
        if (newMax > maxLimit) newMax = maxLimit;
        if (newMax <= newMin) newMax = newMin + 1;

        chart.options.scales.x.min = newMin;
        chart.options.scales.x.max = newMax;
        chart.update('none');
    }
}

export function zoomHistoryChart(factor) {
    if (!interactiveHistoryChartInstance) return;
    const chart = interactiveHistoryChartInstance;
    let curMax = chart.options.scales.y.max ?? chart.scales.y.max;
    let newMax = curMax * factor;
    if (newMax <= 500) newMax = 500;

    chart.options.scales.y.min = 0;
    chart.options.scales.y.max = newMax;
    chart.update('none');
}

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
            chart.options.plugins.zoom.zoom.mode = 'y';
            canvas.style.cursor = 'ns-resize';
        } else if (zone === 'x') {
            chart.options.plugins.zoom.zoom.mode = 'x';
            canvas.style.cursor = 'ew-resize';
        } else {
            chart.options.plugins.zoom.zoom.mode = 'x';
            canvas.style.cursor = 'default';
        }
    };

    canvas.addEventListener('wheel', (e) => {
        updateZoomDirection(e.clientX, e.clientY);
        const chart = getChartInstance();
        if (chart) {
            chart.options.scales.y.min = (isLogScale && interactiveScaleMode === 'logarithmic') ? 500 : 0;
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
        const currentY = e.clientY - canvas.getBoundingClientRect().top;
        const currentX = e.clientX - canvas.getBoundingClientRect().left;

        if (isDragging) {
            if (dragAxis === 'y') {
                const delta = currentY - lastY;
                const factor = delta > 0 ? 1.05 : 0.95;
                const pMin = (isLogScale && interactiveScaleMode === 'logarithmic') ? 500 : 0;
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

export function renderInteractiveChart(categoriesMes) {
    state.cachedCategoriesDataForChart = categoriesMes || [];
    const canvas = document.getElementById('interactive-performance-canvas');
    if (!canvas) return;

    const isLog = (interactiveScaleMode === 'logarithmic');
    const labels = categoriesMes.map(c => c.nombre);
    
    const metaPoints = categoriesMes.map(c => ({
        x: c.nombre,
        y: (isLog && c.meta <= 0) ? 500 : c.meta,
        realVal: c.meta,
        estado: c.estado
    }));

    const gastoPoints = categoriesMes.map(c => ({
        x: c.nombre,
        y: (isLog && c.gasto <= 0) ? 500 : c.gasto,
        realVal: c.gasto,
        estado: c.estado
    }));

    if (interactiveChartInstance) {
        interactiveChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    interactiveChartInstance = new window.Chart(ctx, {
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
                    type: interactiveScaleMode,
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
                    pan: { enabled: true, mode: 'x', threshold: 5 },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: false }, mode: 'x' },
                    limits: { y: { min: isLog ? 500 : 0 } }
                }
            }
        }
    });

    setupDecoupledZoom('interactive-performance-canvas', () => interactiveChartInstance, true);
}

export function renderInteractiveHistoryChart(historicalList) {
    state.cachedHistoricalDataForChart = historicalList || [];
    const canvas = document.getElementById('interactive-history-canvas');
    if (!canvas) return;

    const labels = historicalList.map(h => h.mes);
    const gastos = historicalList.map(h => h.gastoTotal);
    const presupuestos = historicalList.map(h => h.metaTotal);

    if (interactiveHistoryChartInstance) {
        interactiveHistoryChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    interactiveHistoryChartInstance = new window.Chart(ctx, {
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
                    zoom: { wheel: { enabled: true }, pinch: { enabled: false }, mode: 'x' },
                    limits: { y: { min: 0 } }
                }
            }
        }
    });

    setupDecoupledZoom('interactive-history-canvas', () => interactiveHistoryChartInstance, false);
}

export function renderPortfolioPieChart(balances) {
    const container = document.getElementById('pie-chart-container'); 
    const legendContainer = document.getElementById('pie-chart-legend');
    if (!container || !legendContainer) return; 
    container.innerHTML = ""; 
    legendContainer.innerHTML = "";

    const palette = { 
        "Santander": "#ff4b5c", 
        "Efectivo": "#10b981", 
        "Mercado Pago Dante": "#3b82f6", 
        "Mercado Pago Lore": "#9333ea", 
        "Galicia": "#f59e0b" 
    };

    let chartData = []; 
    let sumaPositivos = 0;
    let liquidezNetaReal = 0;

    CUENTAS_OPERATIVAS.forEach(account => { 
        let val = balances[account] || 0; 
        liquidezNetaReal += val; 

        let valGrafico = val < 0 ? 0 : val; 
        sumaPositivos += valGrafico; 
        chartData.push({ name: account, value: val, valGrafico: valGrafico, color: palette[account] || '#888' }); 
    });
    
    const width = 240; 
    const height = 240; 
    const cx = width / 2; 
    const cy = height / 2; 
    const radius = 96;
    let svgHTML = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`; 
    let currentAngle = -Math.PI / 2;

    chartData.forEach(slice => {
        let pct = sumaPositivos === 0 ? 1 / CUENTAS_OPERATIVAS.length : slice.valGrafico / sumaPositivos; 
        if (pct === 0) return; 
        const sliceAngle = pct * 2 * Math.PI; 
        const endAngle = currentAngle + sliceAngle;
        svgHTML += `<path d="M ${cx + radius * Math.cos(currentAngle)} ${cy + radius * Math.sin(currentAngle)} A ${radius} ${radius} 0 ${pct > 0.5 ? 1 : 0} 1 ${cx + radius * Math.cos(endAngle)} ${cy + radius * Math.sin(endAngle)}" fill="none" stroke="${slice.color}" stroke-width="16" />`; 
        currentAngle = endAngle;
    });

    svgHTML += `<circle cx="${cx}" cy="${cy}" r="${radius - 12}" fill="var(--bg-main)" />
                <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">$${liquidezNetaReal.toLocaleString('es-AR')}</text>
                </svg>`; 
    container.innerHTML = svgHTML;
    
    legendContainer.innerHTML = "";
    chartData.forEach(slice => { 
        let fontColor = slice.value < 0 ? 'var(--danger)' : '#fff';
        legendContainer.innerHTML += `<div class="legend-flat-item"><div class="label-bank"><span style="color:${slice.color}">●</span> ${slice.name}</div><div class="value-bank" style="color:${fontColor};">$${slice.value.toLocaleString('es-AR')}</div></div>`; 
    });
}

export function renderSavingsPatrimonialTab(balancesARS, balancesUSD, earningsARS, earningsUSD) {
    const area = document.getElementById('brokers-cards-area'); 
    if (!area) return; 
    area.innerHTML = "";
    CUENTAS_COMITENTES.forEach(broker => {
        let sARS = balancesARS[broker] || 0; 
        let sUSD = balancesUSD[broker] || 0;
        let earning = earningsARS[broker] || 0;
        let sign = earning > 0 ? '+' : (earning < 0 ? '-' : '');
        let absEarning = Math.abs(earning).toLocaleString('es-AR');
        area.innerHTML += `
            <div class="broker-card">
                <div class="broker-title">${broker}</div>
                <div style="font-size:16px; font-weight:700; color:var(--primary);">$${sARS.toLocaleString('es-AR')} | u$d ${sUSD.toLocaleString('es-AR')}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:5px;">Rendimiento del mes: ${sign}$${absEarning}</div>
            </div>`;
    });
}
