import { state, CUENTAS_OPERATIVAS, CUENTAS_COMITENTES, CUENTAS_TARJETAS, getLocalDateString } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

export function exportAuditPDF(auditResult) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("La librería jsPDF aún se está cargando. Intenta de nuevo en unos segundos.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const selector = document.getElementById('global-month-selector');
    const periodo = selector ? selector.options[selector.selectedIndex].text : getLocalDateString().substring(0, 7);

    // 1. Encabezado institucional
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
    doc.text(`Emitido el: ${getLocalDateString()} | Usuario: ${state.currentUser ? state.currentUser.email : 'Dante'}`, 14, 32);

    // 2. Resumen Ejecutivo (Consolidado 1:1 con recalculateFinancialMetrics)
    let y = 46;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("1. Resumen Patrimonial y Flujo del Mes", 14, y);

    const cuentasActivoUnicas = [...new Set([...CUENTAS_OPERATIVAS, ...CUENTAS_COMITENTES])];
    let totalActivos = 0;
    cuentasActivoUnicas.forEach(acc => {
        totalActivos += (state.currentAccountBalancesARS[acc] || 0) + ((state.currentAccountBalancesUSD[acc] || 0) * TIPO_CAMBIO_PRESUPUESTO);
    });

    let deudaTarjetas = 0;
    CUENTAS_TARJETAS.forEach(c => {
        deudaTarjetas += (state.creditCardDebtARS[c] || 0) + ((state.creditCardDebtUSD[c] || 0) * TIPO_CAMBIO_PRESUPUESTO);
    });

    const patrimonioNeto = totalActivos - deudaTarjetas;

    let gastoMes = 0;
    let metaMes = 0;
    (state.cachedCategoriesDataForChart || []).forEach(c => {
        gastoMes += c.gasto;
        metaMes += c.meta;
    });

    const summaryTableData = [
        ["Patrimonio Neto Consolidado", `$${Math.round(patrimonioNeto).toLocaleString('es-AR')}`],
        ["Activos Totales (Bancos + Inversiones)", `$${Math.round(totalActivos).toLocaleString('es-AR')}`],
        ["Pasivo Exigible (Tarjetas de Crédito)", deudaTarjetas > 0 ? `-$${Math.round(deudaTarjetas).toLocaleString('es-AR')}` : (deudaTarjetas < 0 ? `+$${Math.round(Math.abs(deudaTarjetas)).toLocaleString('es-AR')} (A favor)` : '$0')],
        ["Gasto Real Total del Período", `$${Math.round(gastoMes).toLocaleString('es-AR')}`],
        ["Presupuesto Meta Planificado", `$${Math.round(metaMes).toLocaleString('es-AR')}`],
        ["Ahorro / Superávit Presupuestario", `$${Math.round(metaMes - gastoMes).toLocaleString('es-AR')}`]
    ];

    doc.autoTable({
        startY: y + 4,
        body: summaryTableData,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3 },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [55, 65, 81], cellWidth: 110 },
            1: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] }
        }
    });

    // 3. Semáforo Presupuestario RAG
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("2. Desempeño Presupuestario por Categoría (RAG)", 14, y);

    const categoriesTableData = (state.cachedCategoriesDataForChart || []).map(c => [
        c.nombre,
        `$${Math.round(c.meta).toLocaleString('es-AR')}`,
        `$${Math.round(c.gasto).toLocaleString('es-AR')}`,
        `$${Math.round(c.meta - c.gasto).toLocaleString('es-AR')}`,
        c.estado
    ]);

    doc.autoTable({
        startY: y + 4,
        head: [['Categoría', 'Presupuesto', 'Gasto Real', 'Desvío', 'Estado']],
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

    // 4. Dictamen de Auditoría
    if (auditResult) {
        y = doc.lastAutoTable.finalY + 10;
        if (y > 240) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text("3. Dictamen de Auditoría Pre-Flight", 14, y);

        const auditData = [
            ["Score de Integridad", `${auditResult.score} / 100 (${auditResult.ratingText})`],
            ["Partida Doble en Transferencias", auditResult.transferenciasHuerfanas.length === 0 ? "Cuadrada (Sin desfasajes)" : `${auditResult.transferenciasHuerfanas.length} huérfanas`],
            ["Cajas Operativas en Rojo", auditResult.cuentasEnRojo.length === 0 ? "Todas en saldo positivo" : auditResult.cuentasEnRojo.join(', ')],
            ["Deudas en Tarjetas de Crédito", auditResult.tarjetasConDeuda.length === 0 ? "Sin saldo exigible pendiente" : auditResult.tarjetasConDeuda.join(', ')],
            ["Consumos Duplicados", auditResult.posiblesDuplicados.length === 0 ? "Sin duplicados detectados" : `${auditResult.posiblesDuplicados.length} alertas`]
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

    doc.save(`SmartFinance_Reporte_${periodo.replace(/\s+/g, '_')}.pdf`);
}
