import { state, CUENTAS_OPERATIVAS, CUENTAS_COMITENTES, CUENTAS_TARJETAS, getLocalDateString } from './state.js?v=8.3';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js?v=8.3';

/**
 * Renderiza un gráfico de Chart.js fuera de pantalla y devuelve su imagen PNG
 * en base64 de alta resolución para incrustar en el PDF.
 */
async function captureOffscreenChart(chartConfig, width = 900, height = 380) {
    return new Promise((resolve) => {
        const wrapper = document.createElement('div');
        wrapper.style.width = `${width}px`;
        wrapper.style.height = `${height}px`;
        wrapper.style.position = 'fixed';
        wrapper.style.left = '-10000px';
        wrapper.style.top = '0';
        wrapper.style.backgroundColor = '#14141f';
        wrapper.style.pointerEvents = 'none';
        document.body.appendChild(wrapper);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        wrapper.appendChild(canvas);

        const config = {
            type: chartConfig.type,
            data: JSON.parse(JSON.stringify(chartConfig.data || {})),
            options: {
                ...(chartConfig.options || {}),
                animation: false,
                responsive: false,
                maintainAspectRatio: false,
                devicePixelRatio: 2
            }
        };

        let chart = null;
        try {
            chart = new window.Chart(canvas.getContext('2d'), config);
        } catch (e) {
            console.warn('Error al instanciar gráfico offscreen:', e);
            if (wrapper.parentNode) document.body.removeChild(wrapper);
            resolve(null);
            return;
        }

        setTimeout(() => {
            let imgData = null;
            try {
                imgData = canvas.toDataURL('image/png', 1.0);
            } catch (e) {
                console.warn('Error al exportar canvas offscreen:', e);
            }
            if (chart) chart.destroy();
            if (wrapper.parentNode) document.body.removeChild(wrapper);
            resolve(imgData);
        }, 300);
    });
}

export async function exportAuditPDF(auditResult) {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.Chart) {
        if (window.UI && typeof window.UI.showAppAlert === 'function') {
            window.UI.showAppAlert("Cargando Librerías", "Aguardá unos segundos, las librerías de exportación aún se están cargando.");
        } else {
            alert("Aguardá unos segundos, las librerías de exportación aún se están cargando.");
        }
        return;
    }

    if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast("Generando reporte con gráficos de alta resolución...");
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const selector = document.getElementById('global-month-selector');
        const periodo = (selector && selector.selectedIndex >= 0)
            ? selector.options[selector.selectedIndex].text
            : getLocalDateString().substring(0, 7);
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
        // 1. RESUMEN PATRIMONIAL Y FLUJO DEL MES
        // ==========================================
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

        const rawCategories = state.cachedCategoriesDataForChart || [];
        let gastoComputado = 0;
        rawCategories.forEach(c => {
            gastoComputado += (parseFloat(c.gasto) || 0);
        });

        const metaMes = (m.totalPlanificadoMes !== undefined)
            ? m.totalPlanificadoMes
            : rawCategories.reduce((acc, c) => acc + (parseFloat(c.meta) || 0), 0);
        const ingresosMes = m.totalIngresosMes !== undefined ? m.totalIngresosMes : 0;
        const gastosRealesTotales = m.totalEgresosRealesMes !== undefined ? m.totalEgresosRealesMes : gastoComputado;
        const ahorroNetoReal = m.ahorroMes !== undefined ? m.ahorroMes : (ingresosMes - gastosRealesTotales);
        const disponiblePresupuestario = metaMes - gastoComputado;

        const summaryData = [
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
        // 2. DESEMPEÑO PRESUPUESTARIO POR CATEGORÍA (RAG)
        // ==========================================
        y = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text("2. Desempeño Presupuestario por Categoría (RAG)", 14, y);

        const categoriesData = rawCategories.length > 0
            ? rawCategories.map(c => [
                c.nombre,
                `$${Math.round(c.meta).toLocaleString('es-AR')}`,
                `$${Math.round(c.gasto).toLocaleString('es-AR')}`,
                `${(c.meta - c.gasto) >= 0 ? '+' : '-'}$${Math.round(Math.abs(c.meta - c.gasto)).toLocaleString('es-AR')}`,
                c.estado
            ])
            : [['Sin categorías presupuestadas ni consumos registrados en este período.', '-', '-', '-', '-']];

        doc.autoTable({
            startY: y + 4,
            head: [['Categoría', 'Presupuesto', 'Gasto Real', 'Disponible / Desvío', 'Estado']],
            body: categoriesData,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 9 },
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
        // 3. ANÁLISIS GRÁFICO PRESUPUESTARIO E HISTÓRICO
        // ==========================================
        const hist = state.cachedHistoricalDataForChart || [];
        if (rawCategories.length > 0 || hist.length > 0) {
            doc.addPage();
            y = 20;
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text("3. Análisis Gráfico Presupuestario e Histórico", 14, y);
            y += 8;

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
                            x: { ticks: { color: '#9ca3af', font: { size: 9 }, autoSkip: false, maxRotation: 60, minRotation: 45 }, grid: { color: '#252538' } },
                            y: { min: 0, ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#252538' } }
                        },
                        plugins: { legend: { labels: { color: '#ffffff', font: { size: 11 } } } }
                    }
                };
                const imgA = await captureOffscreenChart(chartA, 960, 420);
                if (imgA) {
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(75, 85, 99);
                    doc.text(`Desempeño por Categoría (${periodo})`, 14, y);
                    doc.addImage(imgA, 'PNG', 14, y + 3, 182, 80);
                    y += 92;
                }
            }

            if (hist.length > 0) {
                const hLabels = hist.map(h => h.mes);
                const hGasto = hist.map(h => h.gastoTotal);
                const hMeta = hist.map(h => h.metaTotal);
                const chartB = {
                    type: 'line',
                    data: {
                        labels: hLabels,
                        datasets: [
                            { label: 'Gasto Total ($)', data: hGasto, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.12)', fill: true, tension: 0.25, pointRadius: 4, pointBackgroundColor: '#ef4444' },
                            { label: 'Presupuesto Total ($)', data: hMeta, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.08)', fill: true, tension: 0.25, pointRadius: 4, pointBackgroundColor: '#3b82f6' }
                        ]
                    },
                    options: {
                        scales: {
                            x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#252538' } },
                            y: { min: 0, ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#252538' } }
                        },
                        plugins: { legend: { labels: { color: '#ffffff', font: { size: 11 } } } }
                    }
                };
                const imgB = await captureOffscreenChart(chartB, 960, 360);
                if (imgB) {
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(75, 85, 99);
                    doc.text("Tendencia Histórica Multimensual Consolidada", 14, y);
                    doc.addImage(imgB, 'PNG', 14, y + 3, 182, 68);
                    y += 80;
                }
            }
        } else {
            y = doc.lastAutoTable.finalY + 10;
        }

        // ==========================================
        // 4. RESUMEN EJECUTIVO GLOBAL Y DESVÍOS
        // ==========================================
        if (y > 215) {
            doc.addPage();
            y = 20;
        }
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text("4. Resumen Ejecutivo Global y Desvíos", 14, y);
        y += 8;

        const inTarget = rawCategories.filter(c => c.estado === 'Target').length;
        const catFuera = rawCategories.filter(c => c.estado === 'Fuera');
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(31, 41, 55);

        const desvioPct = metaMes > 0 ? (((gastosRealesTotales - metaMes) / metaMes) * 100) : 0;
        const txtDesvio = desvioPct <= 0
            ? `SUPERÁVIT (${Math.abs(desvioPct).toFixed(1)}% bajo presupuesto)`
            : `DÉFICIT (+${desvioPct.toFixed(1)}% sobre presupuesto)`;

        doc.text(`Exactitud del Presupuesto: Meta $${Math.round(metaMes).toLocaleString('es-AR')} vs Gasto Real $${Math.round(gastosRealesTotales).toLocaleString('es-AR')}`, 14, y);
        doc.text(`Desvío Global: ${txtDesvio}`, 14, y + 5.5);
        doc.text(`Métrica de Eficiencia: Mantuviste ${inTarget} de ${rawCategories.length} categorías en Target seguro.`, 14, y + 11);
        y += 20;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`Detalle de Excesos en Categorías "Fuera":`, 14, y);
        y += 5.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(55, 65, 81);

        if (catFuera.length === 0) {
            doc.text("Ninguna categoría excedió su presupuesto por encima del margen de tolerancia.", 14, y);
            y += 7;
        } else {
            const txsMes = (state.globalTransData || []).filter(t =>
                t.fecha && t.fecha.startsWith(activePeriod) &&
                t.tipo === 'gasto' &&
                t.presupuestado !== 'NO_COMPUTA'
            );
            catFuera.forEach(cf => {
                const exceso = cf.gasto - cf.meta;
                const memos = txsMes
                    .filter(t => t.categoria === cf.nombre)
                    .map(t => `"${t.descripcion || 'Sin detalle'}"`)
                    .join(', ');
                const tLine = `• ${cf.nombre}: +$${Math.round(exceso).toLocaleString('es-AR')} | Memos: ${memos || 'Sin detalle'}`;
                const splitT = doc.splitTextToSize(tLine, 180);
                if (y + (splitT.length * 4.5) > 275) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(splitT, 14, y);
                y += (splitT.length * 4.5) + 2;
            });
        }

        y += 3;
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`Reconciliación y Ajustes Técnicos de Saldos:`, 14, y);
        y += 5.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(55, 65, 81);

        const ajustes = (state.globalTransData || []).filter(t =>
            t.fecha && t.fecha.startsWith(activePeriod) &&
            t.categoria === 'Ajuste Técnico Saldos'
        );
        if (ajustes.length === 0) {
            doc.text("Sin ajustes técnicos ni descuadres de caja registrados en el período.", 14, y);
            y += 7;
        } else {
            const accAjustes = {};
            ajustes.forEach(a => {
                const cta = a.cuenta || 'Cuenta';
                if (!accAjustes[cta]) accAjustes[cta] = { neto: 0, desc: [] };
                const montoNum = parseFloat(a.monto) || 0;
                const fx = (parseFloat(a.tipo_cambio) > 0) ? parseFloat(a.tipo_cambio) : TIPO_CAMBIO_PRESUPUESTO;
                const montoARS = (a.moneda === 'USD') ? montoNum * fx : montoNum;
                accAjustes[cta].neto += (a.tipo === 'ingreso' ? montoARS : -montoARS);
                accAjustes[cta].desc.push(`"${a.descripcion || 'Ajuste'}"`);
            });

            Object.keys(accAjustes).forEach(cta => {
                const inf = accAjustes[cta];
                const tipo = inf.neto >= 0 ? 'Sobrante neto' : 'Faltante neto';
                const sLine = `• ${cta}: ${inf.neto >= 0 ? '+' : '-'}$${Math.round(Math.abs(inf.neto)).toLocaleString('es-AR')} (${tipo}) | Motivos: ${inf.desc.join(', ')}`;
                const splitS = doc.splitTextToSize(sLine, 180);
                if (y + (splitS.length * 4.5) > 275) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(splitS, 14, y);
                y += (splitS.length * 4.5) + 2;
            });
        }

        // ==========================================
        // 5. DICTAMEN DE AUDITORÍA PRE-FLIGHT
        // ==========================================
        if (auditResult) {
            y += 4;
            if (y > 225) {
                doc.addPage();
                y = 20;
            }
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
        // PIE DE PÁGINA INSTITUCIONAL
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
    } catch (err) {
        console.error("Error al generar el reporte PDF:", err);
        if (window.UI && typeof window.UI.showAppAlert === 'function') {
            window.UI.showAppAlert("Error al Generar Reporte", `No se pudo completar la exportación del PDF: ${err.message || "Error interno"}`);
        }
    }
}
