import { state, CUENTAS_OPERATIVAS, CUENTAS_COMITENTES, CUENTAS_TARJETAS, getLocalDateString } from './state.js?v=8.1';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js?v=8.1';

/**
 * Función auxiliar para generar imágenes de gráficos en memoria sin depender de la vista activa.
 */
const generateChartImage = (config) => {
    return new Promise((resolve) => {
        if (!window.Chart) { resolve(null); return; }
        
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 300;
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
        
        config.options = config.options || {};
        config.options.animation = false;
        config.options.responsive = false;
        config.options.devicePixelRatio = 2; // Alta resolución para el PDF
        
        const chart = new window.Chart(canvas, config);
        
        // Pequeño delay para asegurar que el render se complete en memoria
        setTimeout(() => {
            const imgData = canvas.toDataURL('image/png', 1.0);
            chart.destroy();
            canvas.remove();
            resolve(imgData);
        }, 150);
    });
};

export async function exportAuditPDF(auditResult) {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.Chart) {
        if (window.UI && typeof window.UI.showAppAlert === 'function') {
            window.UI.showAppAlert("Cargando Librerías", "Las librerías PDF/Gráficos aún se están cargando. Intentá de nuevo en unos segundos.");
        } else {
            alert("Librerías aún cargando. Intentá de nuevo en unos segundos.");
        }
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const selector = document.getElementById('global-month-selector');
    const periodo = (selector && selector.selectedIndex >= 0)
        ? selector.options[selector.selectedIndex].text
        : getLocalDateString().substring(0, 7);
    const usuarioEmail = (state.currentUser && state.currentUser.email) ? state.currentUser.email : 'Usuario';

    // ==========================================
    // ENCABEZADO
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

    // ==========================================
    // 1. RESUMEN EJECUTIVO / PATRIMONIAL
    // ==========================================
    let y = 46;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("1. Resumen Patrimonial y Flujo del Mes", 14, y);

    const m = state.currentMonthMetrics || {};
    let totalActivos = m.totalActivos;
    let deudaTarjetas = m.deudaTarjetasTotal;
    let patrimonioNeto = m.patrimonioNeto;

    if (totalActivos === undefined) {
        const cuentasActivoUnicas = [...new Set([...CUENTAS_OPERATIVAS, ...CUENTAS_COMITENTES])];
        totalActivos = 0;
        cuentasActivoUnicas.forEach(acc => {
            totalActivos += (state.currentAccountBalancesARS[acc] || 0) + ((state.currentAccountBalancesUSD[acc] || 0) * TIPO_CAMBIO_PRESUPUESTO);
        });
        deudaTarjetas = 0;
        CUENTAS_TARJETAS.forEach(c => {
            deudaTarjetas += (state.creditCardDebtARS[c] || 0) + ((state.creditCardDebtUSD[c] || 0) * TIPO_CAMBIO_PRESUPUESTO);
        });
        patrimonioNeto = totalActivos - deudaTarjetas;
    }

    let gastoComputado = 0;
    (state.cachedCategoriesDataForChart || []).forEach(c => {
        gastoComputado += c.gasto;
    });
    const metaMes = (m.totalPlanificadoMes !== undefined)
        ? m.totalPlanificadoMes
        : (state.cachedCategoriesDataForChart || []).reduce((acc, c) => acc + (parseFloat(c.meta) || 0), 0);

    const ingresosMes = m.totalIngresosMes !== undefined ? m.totalIngresosMes : 0;
    const gastosRealesTotales = m.totalEgresosRealesMes !== undefined ? m.totalEgresosRealesMes : gastoComputado;
    const ahorroNetoReal = m.ahorroMes !== undefined ? m.ahorroMes : (ingresosMes - gastosRealesTotales);
    const disponiblePresupuestario = metaMes - gastoComputado;

    const summaryTableData = [
        ["Patrimonio Neto al Cierre del Período", `${patrimonioNeto < 0 ? '-' : ''}$${Math.round(Math.abs(patrimonioNeto)).toLocaleString('es-AR')}`],
        ["Activos Totales (Bancos + Inversiones)", `$${Math.round(totalActivos).toLocaleString('es-AR')}`],
        ["Pasivo Exigible (Tarjetas de Crédito)", deudaTarjetas > 0 ? `-$${Math.round(deudaTarjetas).toLocaleString('es-AR')}` : (deudaTarjetas < 0 ? `+$${Math.round(Math.abs(deudaTarjetas)).toLocaleString('es-AR')} (A favor)` : '$0')],
        ["Ingresos Reales del Período", `$${Math.round(ingresosMes).toLocaleString('es-AR')}`],
        ["Gastos Reales Totales del Período", `$${Math.round(gastosRealesTotales).toLocaleString('es-AR')} (Computado: $${Math.round(gastoComputado).toLocaleString('es-AR')})`],
        ["Presupuesto Meta Planificado", `$${Math.round(metaMes).toLocaleString('es-AR')}`],
        ["Ahorro Neto Real (Ingresos - Gastos Reales)", `${ahorroNetoReal >= 0 ? '+' : '-'}$${Math.round(Math.abs(ahorroNetoReal)).toLocaleString('es-AR')}`],
        ["Disponible / Desvío Presupuestario Global", `${disponiblePresupuestario >= 0 ? '+' : '-'}$${Math.round(Math.abs(disponiblePresupuestario)).toLocaleString('es-AR')}`]
    ];

    doc.autoTable({
        startY: y + 4,
        body: summaryTableData,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3 },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [55, 65, 81], cellWidth: 110 },
            1: { halign: 'right', fontStyle: 'bold' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 1) {
                const text = String(data.cell.raw || '');
                if (text === '$0' || text === '+$0' || text === '-$0') {
                    data.cell.styles.textColor = [107, 114, 128]; 
                } else if (text.startsWith('-$')) {
                    data.cell.styles.textColor = [239, 68, 68];   
                } else {
                    data.cell.styles.textColor = [16, 185, 129];  
                }
            }
        }
    });

    // ==========================================
    // 2. SEMÁFORO PRESUPUESTARIO RAG
    // ==========================================
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("2. Desempeño Presupuestario por Categoría (RAG)", 14, y);

    const rawCategories = state.cachedCategoriesDataForChart || [];
    const categoriesTableData = rawCategories.length > 0
        ? rawCategories.map(c => {
            const disp = c.meta - c.gasto;
            return [
                c.nombre,
                `$${Math.round(c.meta).toLocaleString('es-AR')}`,
                `$${Math.round(c.gasto).toLocaleString('es-AR')}`,
                `${disp >= 0 ? '+' : '-'}$${Math.round(Math.abs(disp)).toLocaleString('es-AR')}`,
                c.estado
            ];
        })
        : [['Sin categorías presupuestadas ni consumos registrados en este período.', '-', '-', '-', '-']];

    doc.autoTable({
        startY: y + 4,
        head: [['Categoría', 'Presupuesto', 'Gasto Real', 'Disponible / Desvío', 'Estado']],
        body: categoriesTableData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center', fontStyle: 'bold' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 4) {
                if (data.cell.raw === 'Target') data.cell.styles.textColor = [16, 185, 129];
                else if (data.cell.raw === 'Riesgo') data.cell.styles.textColor = [245, 158, 11];
                else if (data.cell.raw === 'Fuera') data.cell.styles.textColor = [239, 68, 68];
            }
        }
    });

    // ==========================================
    // 3. ANÁLISIS GRÁFICO (RECUPERADO)
    // ==========================================
    y = doc.lastAutoTable.finalY + 12;
    if (y > 170) { doc.addPage(); y = 20; }
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("3. Análisis Gráfico Presupuestario e Histórico", 14, y);
    y += 8;

    const historicalList = state.cachedHistoricalDataForChart || [];
    
    if (rawCategories.length > 0) {
        // Gráfico 1: Barras de Categorías
        const barChartConfig = {
            type: 'bar',
            data: {
                labels: rawCategories.map(c => c.nombre),
                datasets: [
                    { label: 'Presupuesto Meta ($)', data: rawCategories.map(c => c.meta), backgroundColor: '#3b82f6' },
                    { label: 'Gasto Real ($)', data: rawCategories.map(c => c.gasto), backgroundColor: '#ef4444' }
                ]
            },
            options: {
                plugins: { legend: { labels: { font: { size: 12 } } } },
                scales: { x: { ticks: { font: { size: 9 }, maxRotation: 90, minRotation: 45 } } }
            }
        };
        const barImg = await generateChartImage(barChartConfig);
        if (barImg) {
            doc.addImage(barImg, 'PNG', 14, y, 182, 60);
            y += 65;
        }
    }

    if (historicalList.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        // Gráfico 2: Línea Histórica
        const lineChartConfig = {
            type: 'line',
            data: {
                labels: historicalList.map(h => h.mes),
                datasets: [
                    { label: 'Gasto Total ($)', data: historicalList.map(h => h.gastoTotal), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.2, pointRadius: 4 },
                    { label: 'Presupuesto Total ($)', data: historicalList.map(h => h.metaTotal), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.2, pointRadius: 4 }
                ]
            },
            options: { plugins: { legend: { labels: { font: { size: 12 } } } } }
        };
        const lineImg = await generateChartImage(lineChartConfig);
        if (lineImg) {
            doc.addImage(lineImg, 'PNG', 14, y, 182, 60);
            y += 65;
        }
    }

    // ==========================================
    // 4. RESUMEN EJECUTIVO GLOBAL (RECUPERADO)
    // ==========================================
    if (y > 230) { doc.addPage(); y = 20; }
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("4. Resumen Ejecutivo Global y Desvíos", 14, y);

    const diffGlobalPct = metaMes > 0 ? ((gastoComputado - metaMes) / metaMes) * 100 : 0;
    const diffGlobalText = diffGlobalPct > 0 
        ? `+${diffGlobalPct.toFixed(1)}% (DÉFICIT)` 
        : `${diffGlobalPct.toFixed(1)}% (SUPERÁVIT)`;
    
    const catsTarget = rawCategories.filter(c => c.estado === 'Target').length;

    const execData = [
        ["Exactitud / Discrepancia:", `Presupuestado: $${Math.round(metaMes).toLocaleString('es-AR')} | Gastado: $${Math.round(gastoComputado).toLocaleString('es-AR')}`],
        ["Desvío del Mes:", diffGlobalText],
        ["Métrica de Eficiencia:", `Mantuviste ${catsTarget} de ${rawCategories.length} categorías en Target seguro.`]
    ];

    // Detalle de Excesos
    const excesos = rawCategories.filter(c => c.estado === 'Fuera');
    if (excesos.length > 0) {
        execData.push(["", ""]);
        execData.push(["Detalle de Excesos en Categorías 'Fuera':", ""]);
        excesos.forEach(c => {
            const txs = (state.globalTransData || []).filter(t => t.categoria === c.nombre && t.fecha && t.fecha.substring(0,7) === m.activeMonth && t.tipo === 'gasto');
            const memos = txs.map(t => `"${t.descripcion}"`).join(', ');
            execData.push([
                `• ${c.nombre}`, 
                `+$${Math.round(c.gasto - c.meta).toLocaleString('es-AR')} | Memos: ${memos || 'N/D'}`
            ]);
        });
    }

    // Ajustes Técnicos
    const ajustesTxs = (state.globalTransData || []).filter(t => t.categoria === 'Ajuste Técnico Saldos' && t.fecha && t.fecha.substring(0,7) === m.activeMonth);
    if (ajustesTxs.length > 0) {
        execData.push(["", ""]);
        execData.push(["Reconciliación y Ajustes de Saldos:", ""]);
        const accs = [...new Set(ajustesTxs.map(t => t.cuenta))];
        accs.forEach(acc => {
            const txs = ajustesTxs.filter(t => t.cuenta === acc);
            let neto = 0;
            txs.forEach(t => { neto += (t.tipo === 'ingreso' ? parseFloat(t.monto) : -parseFloat(t.monto)); });
            const textNeto = neto >= 0 
                ? `+$${Math.round(neto).toLocaleString('es-AR')} (Sobrante neto)` 
                : `-$${Math.round(Math.abs(neto)).toLocaleString('es-AR')} (Faltante neto)`;
            const memos = txs.map(t => `"${t.descripcion}"`).join(', ');
            execData.push([`• ${acc}`, `${textNeto} | Motivos: ${memos || 'N/D'}`]);
        });
    }

    doc.autoTable({
        startY: y + 4,
        body: execData,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.5 },
        columnStyles: { 
            0: { fontStyle: 'bold', textColor: [75, 85, 99], cellWidth: 70 }, 
            1: { textColor: [31, 41, 55] } 
        }
    });

    // ==========================================
    // 5. DICTAMEN DE AUDITORÍA
    // ==========================================
    if (auditResult) {
        y = doc.lastAutoTable.finalY + 12;
        if (y > 220) { doc.addPage(); y = 20; }

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text("5. Dictamen de Auditoría Pre-Flight", 14, y);

        const vencimientosList = auditResult.vencimientosImpagos || [];
        const vencimientosText = vencimientosList.length === 0
            ? "Todos los vencimientos al día"
            : `${vencimientosList.length} pendientes (${vencimientosList.join(', ')})`;

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
            columnStyles: {
                0: { fontStyle: 'bold', textColor: [75, 85, 99], cellWidth: 80 },
                1: { textColor: [31, 41, 55] }
            }
        });
    }

    // ==========================================
    // PAGINACIÓN Y PIE
    // ==========================================
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 130);
        doc.text(
            `Cotización referencial Dólar MEP aplicada: $${Number(TIPO_CAMBIO_PRESUPUESTO).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Página ${i} de ${pageCount}`,
            14,
            290
        );
    }

    doc.save(`SmartFinance_Reporte_${periodo.replace(/\s+/g, '_')}.pdf`);
}
