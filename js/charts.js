import { state, CUENTAS_COMITENTES, escapeHTML, getLocalDateString } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

let performanceChart = null;
let historyChart = null;
let categoryHistoryChartInstance = null;
let currentScaleMode = 'linear';

/**
 * Control de Zoom Desacoplado por Zonas de Eje (Rueda del ratón activa en Eje Y y Eje X)
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
            canvas.style.cursor = 'ns-resize';
        } else if (zone === 'x') {
            canvas.style.cursor = 'ew-resize';
        } else {
            canvas.style.cursor = 'default';
        }
    };

    canvas.addEventListener('wheel', (e) => {
        const chart = getChartInstance();
        if (!chart || !chart.chartArea) return;
        const zone = getAxisZone(e.clientX, e.clientY);

        if (zone === 'y') {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 1.15 : 0.85;
            const pMin = (isLogScale && currentScaleMode === 'logarithmic') ? 500 : 0;
            let curMax = chart.options.scales.y.max ?? chart.scales.y.max;
            let newMax = curMax * factor;
            if (newMax <= pMin + 10000) newMax = pMin + 10000;

            chart.options.scales.y.min = pMin;
            chart.options.scales.y.max = newMax;
            chart.update('none');
        } else if (zone === 'x') {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 1.2 : 0.8;
            chart.zoom({ x: factor });
        }
    }, { capture: true, passive: false });

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
 * Gráfico Donut de Liquidez Operativa (ARS puro en cifra principal)
 * Leyenda con importes en pesos alineados a la derecha y dólares debajo
 */
export function renderPortfolioPieChart(balancesARS, balancesUSD = {}) {
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

    let totalARS = 0;
    const items = accounts.map(acc => {
        const valARS = parseFloat(balancesARS[acc.name]) || 0;
        const valUSD = parseFloat(balancesUSD[acc.name]) || 0;
        const sliceVal = Math.max(0, valARS);
        totalARS += sliceVal;

        return { 
            ...acc, 
            value: valARS,
            sliceVal,
            valUSD
        };
    });

    const size = 280;
    const strokeWidth = 34;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    let circlesHTML = '';
    if (totalARS === 0) {
        circlesHTML = `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="#252538" stroke-width="${strokeWidth}" />`;
    } else {
        items.forEach(item => {
            if (item.sliceVal <= 0) return;
            const ratio = item.sliceVal / totalARS;
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

    const formattedTotal = `$${Math.round(totalARS).toLocaleString('es-AR')}`;

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
        let fontColor = item.value < 0 ? 'var(--danger)' : '#ffffff';
        const usdBadge = item.valUSD !== 0 
            ? `<span class="sub-usd-val" style="font-size:11px; color:var(--text-muted); font-weight:600; white-space:nowrap; margin-top:2px;">(u$d ${item.valUSD.toFixed(2)})</span>` 
            : '';

        return `
            <div class="legend-flat-item">
                <span class="label-bank">
                    <span class="account-dot" style="background:${item.color};"></span>
                    <span>${escapeHTML(item.name)}</span>
                </span>
                <div class="value-bank" style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; text-align:right;">
                    <span style="color:${fontColor}; font-size:16px; font-weight:700; font-family:'Urbanist', sans-serif; white-space:nowrap;">$${item.value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    ${usdBadge}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Fichas de Inversiones Patrimoniales
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
                <div class="broker-title"><i class="fa-solid fa-vault"></i> ${escapeHTML(b)}</div>
                <div style="font-size: 19px; font-weight: 700; font-family: 'Urbanist'; color: #fff;">
                    $${Math.round(totalEquivARS).toLocaleString('es-AR')}
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 8px;">
                    <span>ARS: $${Math.round(saldoARS).toLocaleString('es-AR')}</span>
                    <span>USD: u$d ${saldoUSD.toFixed(2)}</span>
                </div>
                <div style="font-size: 11px; color: var(--primary); font-weight: 600;">
                    Rendimiento Mes: ${rendARS >= 0 ? '+' : '-'}$${Math.round(Math.abs(rendARS)).toLocaleString('es-AR')} ${rendUSD !== 0 ? `(${rendUSD > 0 ? '+' : '-'}u$d ${Math.abs(rendUSD).toFixed(2)})` : ''}
                </div>
            </div>
        `;
    });
}

/**
 * GRÁFICO 1: Desempeño por Categoría (Mes Activo)
 */
export function renderInteractiveChart(categoriesMes) {
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
                    pan: { enabled: true, mode: 'x', threshold: 5 },
                    zoom: { wheel: { enabled: false }, pinch: { enabled: true }, mode: 'x' },
                    limits: { y: { min: isLog ? 500 : 0 } }
                }
            }
        }
    });

    setupDecoupledZoom('interactive-performance-canvas', () => performanceChart, true);
}

/**
 * GRÁFICO 2: Evolución Histórica por Categoría (Combo Chart + Micro KPIs)
 */
export function renderCategoryHistoryChart(categoryName, monthsCount) {
    const canvas = document.getElementById('category-history-canvas');
    if (!canvas) return;

    const categoriasDisponibles = (state.misCategoriasUnificadas && state.misCategoriasUnificadas.length > 0)
        ? state.misCategoriasUnificadas
        : ['Supermercado', 'Farmacia', 'Nafta', 'Restaurantes'];

    if (!categoryName) {
        categoryName = state.selectedCategoryHistoryName || 
            (categoriasDisponibles.includes('Supermercado') ? 'Supermercado' : categoriasDisponibles[0]);
    }
    state.selectedCategoryHistoryName = categoryName;

    const n = parseInt(monthsCount, 10) || state.selectedCategoryHistoryRange || 6;
    state.selectedCategoryHistoryRange = n;

    const selectEl = document.getElementById('cat-history-category-select');
    if (selectEl) {
        if (selectEl.options.length === 0) {
            selectEl.innerHTML = "";
            categoriasDisponibles.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.innerText = c;
                selectEl.appendChild(opt);
            });
        }
        selectEl.value = categoryName;
    }

    const monthSelector = document.getElementById('global-month-selector');
    const activePeriod = monthSelector ? monthSelector.value : getLocalDateString().substring(0, 7);

        const [actY, actM] = activePeriod.split('-').map(Number);
    
    // AUD-N08: No promediar meses futuros vacíos
    const today = new Date();
    const currY = today.getFullYear();
    const currM = today.getMonth() + 1;
    let limitM = actM;
    let limitY = actY;
    if (actY > currY || (actY === currY && actM > currM)) {
        limitM = currM;
        limitY = currY;
    }

    const mesesAbrev = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const timeline = [];
    for (let i = n - 1; i >= 0; i--) {
        let curM = limitM - i;
        let curY = limitY;
        while (curM <= 0) {
            curM += 12;
            curY -= 1;
        }
        const pStr = `${curY}-${String(curM).padStart(2, '0')}`;
        const lbl = `${mesesAbrev[curM - 1]} ${String(curY).substring(2)}`;
        timeline.push({ periodo: pStr, label: lbl });
    }

    let totalGasto = 0;
    let totalMeta = 0;
    let monthsWithMeta = 0;
    let monthsInTarget = 0;
    let maxGasto = 0;
    let maxGastoMonth = '';

    const labels = [];
    const gastoData = [];
    const metaData = [];
    const barColors = [];
    const barBorderColors = [];
    const details = [];

    timeline.forEach(m => {
        labels.push(m.label);

        const budgetItem = (state.allBudgetDataHistorico || []).find(b => b.periodo === m.periodo && b.nombre === categoryName);
        const metaVal = budgetItem ? (parseFloat(budgetItem.presupuesto_mensual) || 0) : 0;
        metaData.push(metaVal);
        totalMeta += metaVal;

        let gastoVal = 0;
        (state.globalTransData || []).forEach(t => {
            if (t.fecha && t.fecha.substring(0, 7) === m.periodo && 
                t.categoria === categoryName && 
                t.tipo === 'gasto' && 
                t.presupuestado !== 'NO_COMPUTA' &&
                t.categoria !== 'Transferencia Interna' &&
                t.categoria !== 'Compra/Venta Divisas' &&
                t.categoria !== 'Pago Tarjeta de Crédito' &&
                t.categoria !== 'Ajuste Técnico Saldos') {
                const monto = parseFloat(t.monto) || 0;
                const fx = (parseFloat(t.tipo_cambio) > 0) ? parseFloat(t.tipo_cambio) : TIPO_CAMBIO_PRESUPUESTO;
                gastoVal += (t.moneda === 'USD') ? monto * fx : monto;
            }
        });

        gastoData.push(gastoVal);
        totalGasto += gastoVal;

        if (gastoVal > maxGasto) {
            maxGasto = gastoVal;
            maxGastoMonth = m.label;
        }

        if (metaVal > 0) {
            monthsWithMeta++;
            if (gastoVal <= metaVal) {
                monthsInTarget++;
                barColors.push('rgba(16, 185, 129, 0.85)'); // Target (Verde)
                barBorderColors.push('#10b981');
            } else if (gastoVal <= metaVal * 1.10) {
                barColors.push('rgba(245, 158, 11, 0.85)'); // Riesgo (Amarillo)
                barBorderColors.push('#f59e0b');
            } else {
                barColors.push('rgba(239, 68, 68, 0.85)'); // Fuera (Rojo)
                barBorderColors.push('#ef4444');
            }
        } else {
            barColors.push('rgba(59, 130, 246, 0.85)'); // Azul neutral si no hubo meta
            barBorderColors.push('#3b82f6');
        }

        details.push({
            periodo: m.periodo,
            label: m.label,
            gasto: gastoVal,
            meta: metaVal
        });
    });

    // Renderizar Micro-KPIs
    const kpiContainer = document.getElementById('cat-history-kpis-container');
    if (kpiContainer) {
        const avgGasto = n > 0 ? (totalGasto / n) : 0;
        let cumplimientoHTML = '';
        if (monthsWithMeta > 0) {
            const pct = Math.round((monthsInTarget / monthsWithMeta) * 100);
            const colorPct = pct >= 80 ? 'var(--primary)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)');
            cumplimientoHTML = `
                <div class="micro-kpi-card">
                    <span class="micro-kpi-title">Cumplimiento Meta</span>
                    <span class="micro-kpi-val" style="color: ${colorPct};">${pct}%</span>
                    <span class="micro-kpi-sub">${monthsInTarget} de ${monthsWithMeta} meses en meta</span>
                </div>
            `;
        } else {
            cumplimientoHTML = `
                <div class="micro-kpi-card">
                    <span class="micro-kpi-title">Mes Pico / Máximo</span>
                    <span class="micro-kpi-val">$${Math.round(maxGasto).toLocaleString('es-AR')}</span>
                    <span class="micro-kpi-sub">${escapeHTML(maxGastoMonth || 'Sin consumos')}</span>
                </div>
            `;
        }

        kpiContainer.innerHTML = `
            <div class="micro-kpi-card">
                <span class="micro-kpi-title">Gasto Acumulado (${n}M)</span>
                <span class="micro-kpi-val">$${Math.round(totalGasto).toLocaleString('es-AR')}</span>
                <span class="micro-kpi-sub">Total período</span>
            </div>
            <div class="micro-kpi-card">
                <span class="micro-kpi-title">Promedio Mensual</span>
                <span class="micro-kpi-val">$${Math.round(avgGasto).toLocaleString('es-AR')}</span>
                <span class="micro-kpi-sub">Por mes</span>
            </div>
            ${cumplimientoHTML}
        `;
    }

    if (categoryHistoryChartInstance) {
        categoryHistoryChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    categoryHistoryChartInstance = new window.Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Presupuesto Meta ($)',
                    type: 'line',
                    data: metaData,
                    borderColor: '#38bdf8',
                    backgroundColor: '#38bdf8',
                    borderWidth: 2.5,
                    borderDash: [5, 5],
                    pointBackgroundColor: '#38bdf8',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4.5,
                    pointHoverRadius: 7,
                    tension: 0.15,
                    order: 1
                },
                {
                    label: 'Gasto Real ($)',
                    type: 'bar',
                    data: gastoData,
                    backgroundColor: barColors,
                    borderColor: barBorderColors,
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.62,
                    categoryPercentage: 0.8,
                    order: 2
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
                            if (!contexts || contexts.length === 0) return '';
                            const idx = contexts[0].dataIndex;
                            const d = details[idx];
                            if (!d) return '';
                            if (d.meta > 0) {
                                const diff = d.meta - d.gasto;
                                const statusTxt = diff >= 0 
                                    ? `🟢 Ahorro: +$${Math.round(diff).toLocaleString('es-AR')}`
                                    : `🔴 Exceso: -$${Math.round(Math.abs(diff)).toLocaleString('es-AR')}`;
                                return ` ${statusTxt}`;
                            }
                            return ' Sin presupuesto asignado';
                        }
                    }
                }
            }
        }
    });
}

/**
 * GRÁFICO 3: Tendencia Histórica Multimensual Consolidada
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
            const pMin = (currentScaleMode === 'logarithmic') ? 500 : 0;
            let curMax = performanceChart.options.scales.y.max ?? performanceChart.scales.y.max;
            let newMax = curMax * factor;
            if (newMax <= pMin + 10000) newMax = pMin + 10000;
            performanceChart.options.scales.y.min = pMin;
            performanceChart.options.scales.y.max = newMax;
            performanceChart.update('none');
        }
    }
}

export function zoomHistoryChart(factor) {
    if (historyChart) {
        let curMax = historyChart.options.scales.y.max ?? historyChart.scales.y.max;
        let newMax = curMax * factor;
        if (newMax <= 10000) newMax = 10000;
        historyChart.options.scales.y.min = 0;
        historyChart.options.scales.y.max = newMax;
        historyChart.update('none');
    }
}
