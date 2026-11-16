import { state, CUENTAS_OPERATIVAS, CUENTAS_COMITENTES, CUENTAS_TARJETAS, getLocalDateString } from './state.js?v=8.2';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js?v=8.2';

/**
 * Función auxiliar para renderizar gráficos de Chart.js fuera de pantalla
 * y capturarlos como imagen en base64 para el PDF.
 */
async function captureOffscreenChart(chartConfig, width = 800, height = 350) {
    return new Promise((resolve) => {
        const wrapper = document.createElement('div');
        wrapper.style.width = width + 'px';
        wrapper.style.height = height + 'px';
        wrapper.style.position = 'absolute';
        wrapper.style.left = '-9999px';
        wrapper.style.top = '-9999px';
        wrapper.style.backgroundColor = '#14141f'; // Fondo igual a la app
        document.body.appendChild(wrapper);

        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);

        // Desactivar animaciones y responsividad para captura inmediata
        const config = JSON.parse(JSON.stringify(chartConfig)); // Clon profundo base
        if (chartConfig.data) config.data = chartConfig.data; // Mantener referencias a funciones si las hay (aunque en json se pierden, re-asignamos data)
        config.options = chartConfig.options || {};
        config.options.animation = false;
        config.options.responsive = false;
        config.options.maintainAspectRatio = false;
        config.options.devicePixelRatio = 2; // Alta resolución

        const chart = new window.Chart(canvas.getContext('2d'), config);
        
        setTimeout(() => {
            const imgData = canvas.toDataURL('image/png', 1.0);
            chart.destroy();
            document.body.removeChild(wrapper);
            resolve(imgData);
        }, 350); // Pequeño delay para asegurar renderizado completo de fuentes
    });
}

export async function exportAuditPDF(auditResult) {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.Chart) {
        if (window.UI) window.UI.showAppAlert("Cargando", "Aguardá unos segundos, las librerías de exportación se están cargando.");
        return;
    }

    if (window.UI && window.UI.showToast) {
        window.UI.showToast("Generando reporte con gráficos de alta resolución...");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const selector = document.getElementById('global-month-selector');
    const periodo = (selector && selector.selectedIndex >= 0) ? selector.options[selector.selectedIndex].text : getLocalDateString().substring(0, 7);
    const usuarioEmail = (state.currentUser && state.currentUser.email) ? state.currentUser.email : 'Usuario';
    const activePeriod = selector ? selector.value : getLocalDateString().substring(0, 7);

    // ==========================================
    // 0. ENCABEZADO INSTITUCIONAL
    // ==========================================
    doc.setFillColor(20, 20, 31);
    doc.rect(0, 0, 210, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text("SmartFinance AI", 14, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text(`Informe Financiero y Auditoría de Cierre - ${periodo}`, 14, 26);
    doc.setFontSize(8);
    doc.text(`Emitido el: ${getLocalDateString()} | Usuario: ${usuarioEmail}`, 14, 32);

    let y = 46;

    // ==========================================
    // 1. RESUMEN PATRIMONIAL
    // ==========================================
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("1. Resumen Patrimonial y Flujo del Mes", 14, y);

    const m = state.currentMonthMetrics || {};
    let totalActivos = m.totalActivos || 0;
    let deudaTarjetas = m.deudaTarjetasTotal || 0;
    let patrimonioNeto = m.patrimonioNeto || 0;
    
    let gastoComputado = 0;
    (state.cachedCategoriesDataForChart || []).forEach(c => gastoComputado += c.gasto);
    const metaMes = (m.totalPlanificadoMes !== undefined) ? m.totalPlanificadoMes : (state.cachedCategoriesDataForChart || []).reduce((a, c) => a + c.meta, 0);
    const ingresosMes = m.totalIngresosMes || 0;
    const gastosRealesTotales = m.totalEgresosRealesMes !== undefined ? m.totalEgresosRealesMes : gastoComputado;
    const ahorroNetoReal = m.ahorroMes !== undefined ? m.ahorroMes : (ingresosMes - gastosRealesTotales);
    const disponiblePresupuestario = metaMes - gastoComputado;

    const summaryData = [
        ["Patrimonio Neto al Cierre del Período", `${patrimonioNeto < 0 ? '-' : ''}$${Math.round(Math.abs(patrimonioNeto)).toLocaleString('es-AR')}`],
        ["Activos Totales (Bancos + Inversiones)", `$${Math.round(totalActivos).toLocaleString('es-AR')}`],
        ["Pasivo Exigible (Tarjetas de Crédito)", deudaTarjetas > 0 ? `-$${Math.round(deudaTarjetas).toLocaleString('es-AR')}` : '$0'],
        ["Ingresos Reales del Período", `$${Math.round(ingresosMes).toLocaleString('es-AR')}`],
        ["Gastos Reales Totales del Período", `$${Math.round(gastosRealesTotales).toLocaleString('es-AR')} (Computado: $${Math.round(gastoComputado).toLocaleString('es-AR')})`],
        ["Presupuesto Meta Planificado", `$${Math.round(metaMes).toLocaleString('es-AR')}`],
        ["Ahorro Neto Real (Ingresos - Gastos Reales)", `${ahorroNetoReal >= 0 ? '+' : '-'}$${Math.round(Math.abs(ahorroNetoReal)).toLocaleString('es-AR')}`],
        ["Disponible / Desvío Presupuestario Global", `${disponiblePresupuestario >= 0 ? '+' : '-'}$${Math.round(Math.abs(disponiblePresupuestario)).toLocaleString('es-AR')}`]
    ];

    doc.autoTable({
        startY: y + 4,
        body: summaryData,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3 },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [55, 65, 81], cellWidth: 110 },
            1: { halign: 'right', fontStyle: 'bold' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 1) {
                const text = String(data.cell.raw || '');
                if (text === '$0' || text === '+$0' || text === '-$0') data.cell.styles.textColor = [107, 114, 128];
                else if (text.startsWith('-$')) data.cell.styles.textColor = [239, 68, 68];
                else data.cell.styles.textColor = [16, 185, 129];
            }
        }
    });

    // ==========================================
    // 2. DESEMPEÑO RAG
    // ==========================================
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("2. Desempeño Presupuestario por Categoría (RAG)", 14, y);

    const rawCategories = state.cachedCategoriesDataForChart || [];
    const categoriesData = rawCategories.length > 0
        ? rawCategories.map(c => [
            c.nombre,
            `$${Math.round(c.meta).toLocaleString('es-AR')}`,
            `$${Math.round(c.gasto).toLocaleString('es-AR')}`,
            `${(c.meta - c.gasto) >= 0 ? '+' : '-'}$${Math.round(Math.abs(c.meta - c.gasto)).toLocaleString('es-AR')}`,
            c.estado
        ])
        : [['Sin datos', '-', '-', '-', '-']];

    doc.autoTable({
        startY: y + 4,
        head: [['Categoría', 'Presupuesto', 'Gasto Real', 'Disponible/Desvío', 'Estado']],
        body: categoriesData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'center', fontStyle: 'bold' } },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 4) {
                if (data.cell.raw === 'Target') data.cell.styles.textColor = [16, 185, 129];
                else if (data.cell.raw === 'Riesgo') data.cell.styles.textColor = [245, 158, 11];
                else if (data.cell.raw === 'Fuera') data.cell.styles.textColor = [239, 68, 68];
            }
        }
    });

    // ==========================================
    // 3. ANÁLISIS GRÁFICO (Canvas en Memoria)
    // ==========================================
    doc.addPage();
    y = 20;
    doc.setFontSize(13);
    doc.text("3. Análisis Gráfico Presupuestario e Histórico", 14, y);

    // Gráfico A: Barras del Mes
    if (rawCategories.length > 0) {
        const cLabels = rawCategories.map(c => c.nombre);
        const cMeta = rawCategories.map(c => c.meta);
        const cGasto = rawCategories.map(c => c.gasto);
        const chartA = {
            type: 'bar',
            data: {
                labels: cLabels,
                datasets: [
                    { label: 'Presupuesto ($)', data: cMeta, backgroundColor: '#3b82f6', categoryPercentage: 0.8, barPercentage: 0.9 },
                    { label: 'Gasto Real ($)', data: cGasto, backgroundColor: '#ef4444', categoryPercentage: 0.8, barPercentage: 0.9 }
                ]
            },
            options: {
                scales: { 
                    x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#252538' } },
                    y: { ticks: { color: '#9ca3af' }, grid: { color: '#252538' } }
                },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        };
        const imgA = await captureOffscreenChart(chartA, 900, 400);
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);
        doc.text(`Desempeño por Categoría (${periodo})`, 14, y + 8);
        doc.addImage(imgA, 'PNG', 14, y + 10, 180, 80);
        y += 100;
    }

    // Gráfico B: Histórico
    const hist = state.cachedHistoricalDataForChart || [];
    if (hist.length > 0) {
        const hLabels = hist.map(h => h.mes);
        const hGasto = hist.map(h => h.gastoTotal);
        const hMeta = hist.map(h => h.metaTotal);
        const chartB = {
            type: 'line',
            data: {
                labels: hLabels,
                datasets: [
                    { label: 'Gasto Total ($)', data: hGasto, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.2, pointRadius: 4 },
                    { label: 'Presupuesto Total ($)', data: hMeta, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.05)', fill: true, tension: 0.2, pointRadius: 4 }
                ]
            },
            options: {
                scales: { x: { ticks: { color: '#9ca3af' }, grid: { color: '#252538' } }, y: { min: 0, ticks: { color: '#9ca3af' }, grid: { color: '#252538' } } },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        };
        const imgB = await captureOffscreenChart(chartB, 900, 350);
        doc.text("Tendencia Histórica Multimensual Consolidada", 14, y + 4);
        doc.addImage(imgB, 'PNG', 14, y + 6, 180, 70);
        y += 85;
    }

    // ==========================================
    // 4. RESUMEN EJECUTIVO GLOBAL Y DESVÍOS
    // ==========================================
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("4. Resumen Ejecutivo Global y Desvíos", 14, y);
    y += 8;

    // A. Eficiencia
    const inTarget = rawCategories.filter(c => c.estado === 'Target').length;
    const catFuera = rawCategories.filter(c => c.estado === 'Fuera');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const desvioPct = metaMes > 0 ? (((gastosRealesTotales - totalPlanificadoMes) / totalPlanificadoMes) * 100) : 0;
    const txtDesvio = desvioPct <= 0 ? `SUPERÁVIT (${Math.abs(desvioPct).toFixed(1)}%)` : `DÉFICIT (+${desvioPct.toFixed(1)}%)`;
    
    doc.text(`Exactitud del Presupuesto: Meta $${Math.round(metaMes).toLocaleString('es-AR')} vs Gasto $${Math.round(gastosRealesTotales).toLocaleString('es-AR')}`, 14, y);
    doc.text(`Desvío Global: ${txtDesvio}`, 14, y + 6);
    doc.text(`Métrica de Eficiencia: Mantuviste ${inTarget} de ${rawCategories.length} categorías en Target seguro.`, 14, y + 12);
    y += 22;

    // B. Detalle Excesos
    doc.setFont('helvetica', 'bold');
    doc.text(`Detalle de Excesos en Categorías "Fuera":`, 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    if (catFuera.length === 0) {
        doc.text("✓ Ninguna categoría excedió gravemente su presupuesto.", 14, y);
        y += 8;
    } else {
        const txsMes = state.globalTransData.filter(t => t.fecha && t.fecha.startsWith(activePeriod) && t.tipo === 'gasto');
        catFuera.forEach(cf => {
            const exceso = cf.gasto - cf.meta;
            const memos = txsMes.filter(t => t.categoria === cf.nombre).map(t => `"${t.descripcion}"`).join(', ');
            const tLine = `• ${cf.nombre}: +$${Math.round(exceso).toLocaleString('es-AR')} | Memos: ${memos || 'Sin detalle'}`;
            const splitT = doc.splitTextToSize(tLine, 180);
            doc.text(splitT, 14, y);
            y += (splitT.length * 4.5) + 2;
            if (y > 270) { doc.addPage(); y = 20; }
        });
    }

    // C. Ajustes Técnicos
    y += 4;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Reconciliación y Ajustes Técnicos de Saldos:`, 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const ajustes = state.globalTransData.filter(t => t.fecha && t.fecha.startsWith(activePeriod) && t.categoria === 'Ajuste Técnico Saldos');
    if (ajustes.length === 0) {
        doc.text("✓ Sin ajustes manuales ni descuadres de caja en el mes.", 14, y);
        y += 8;
    } else {
        const accAjustes = {};
        ajustes.forEach(a => {
            if (!accAjustes[a.cuenta]) accAjustes[a.cuenta] = { neto: 0, desc: [] };
            accAjustes[a.cuenta].neto += (a.tipo === 'ingreso' ? a.monto : -a.monto);
            accAjustes[a.cuenta].desc.push(`"${a.descripcion}"`);
        });
        
        Object.keys(accAjustes).forEach(cta => {
            const inf = accAjustes[cta];
            const tipo = inf.neto >= 0 ? 'Sobrante neto' : 'Faltante neto';
            const sLine = `• ${cta}: ${inf.neto >= 0 ? '+' : '-'}$${Math.round(Math.abs(inf.neto)).toLocaleString('es-AR')} (${tipo}) | Motivos: ${inf.desc.join(', ')}`;
            const splitS = doc.splitTextToSize(sLine, 180);
            doc.text(splitS, 14, y);
            y += (splitS.length * 4.5) + 2;
            if (y > 270) { doc.addPage(); y = 20; }
        });
    }

    // ==========================================
    // 5. DICTAMEN DE AUDITORÍA
    // ==========================================
    y += 4;
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text("5. Dictamen de Auditoría Pre-Flight", 14, y);

    const vencimientosList = auditResult.vencimientosImpagos || [];
    const vencimientosText = vencimientosList.length === 0 ? "Todos los vencimientos al día" : `${vencimientosList.length} pendientes (${vencimientosList.join(', ')})`;
    const auditData = [
        ["Score de Integridad", `${auditResult.score} / 100 (${auditResult.ratingText})`],
        ["Partida Doble en Transferencias", auditResult.transferenciasHuerfanas.length === 0 ? "Cuadrada (Sin desfasajes)" : `${auditResult.transferenciasHuerfanas.length} huérfanas`],
        ["Cajas Operativas en Rojo", auditResult.cuentasEnRojo.length === 0 ? "Todas en saldo positivo" : auditResult.cuentasEnRojo.join(', ')],
        ["Deudas en Tarjetas de Crédito", auditResult.tarjetasConDeuda.length === 0 ? "Sin saldo exigible pendiente" : auditResult.tarjetasConDeuda.join(', ')],
        ["Consumos Duplicados", auditResult.posiblesDuplicados.length === 0 ? "Sin duplicados detectados" : `${auditResult.posiblesDuplicados.length} alertas`],
        ["Compromisos y Vencimientos", vencimientosText]
    ];

    doc.autoTable({
        startY: y + 4,
        body: auditData,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: 'bold', textColor: [75, 85, 99], cellWidth: 80 }, 1: { textColor: [31, 41, 55] } }
    });

    // PIE DE PÁGINA
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 130);
        doc.text(`Cotización referencial Dólar MEP aplicada: $${Number(TIPO_CAMBIO_PRESUPUESTO).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Página ${i} de ${pageCount}`, 14, 290);
    }

    doc.save(`SmartFinance_Reporte_${periodo.replace(/\s+/g, '_')}.pdf`);
}
