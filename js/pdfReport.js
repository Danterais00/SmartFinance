import { state, MESES_ES, getLocalDateString } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';
import { calcularEstadoRAG, executeFinancialAuditEngine } from './financeEngine.js';

export async function exportAuditPDF(providedAuditResult = null) {
    if (!window.jspdf || !window.Chart) {
        if (window.UI?.showAppAlert) {
            window.UI.showAppAlert("Error", "Cargando librerías PDF en memoria... Reintenta en unos segundos.");
        }
        return;
    }

    if (window.UI?.showToast) {
        window.UI.showToast("Generando reporte integral auditado...");
    }

    try {
        const audit = providedAuditResult || executeFinancialAuditEngine();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');
        const margin = 40;
        const anchoPagina = doc.internal.pageSize.getWidth();
        const altoPagina = doc.internal.pageSize.getHeight();
        let cursorY = margin;

        const selector = document.getElementById('global-month-selector');
        const activeMonthFilter = selector ? selector.value : getLocalDateString().substring(0, 7);
        const [year, mNum] = activeMonthFilter.split('-');
        const nombreMes = MESES_ES[parseInt(mNum) - 1] || activeMonthFilter;
        const periodoStr = `${nombreMes} ${year}`;

        let activeCats = [...state.misCategoriasUnificadas];
        let expMap = {};
        let budMap = {};
        activeCats.forEach(c => { expMap[c] = 0; budMap[c] = 0; });

        let ajustesPorCuenta = {};

        if (state.globalBudgetData) {
            state.globalBudgetData.forEach(b => {
                if (budMap[b.nombre] !== undefined) {
                    budMap[b.nombre] = parseFloat(b.presupuesto_mensual) || 0;
                }
            });
        }

        if (state.globalTransData) {
            state.globalTransData.forEach(t => {
                if (t.fecha && t.fecha.substring(0, 7) === activeMonthFilter) {
                    const montoVal = parseFloat(t.monto) || 0;
                    const converted = (t.moneda === 'USD') ? montoVal * (t.tipo_cambio || TIPO_CAMBIO_PRESUPUESTO) : montoVal;

                    if (t.categoria === 'Ajuste Técnico Saldos') {
                        let acc = t.cuenta || 'Efectivo';
                        if (!ajustesPorCuenta[acc]) ajustesPorCuenta[acc] = { neto: 0, memos: [] };
                        
                        if (t.tipo === 'gasto') ajustesPorCuenta[acc].neto -= converted;
                        else ajustesPorCuenta[acc].neto += converted;
                        
                        if (t.descripcion && t.descripcion.trim() !== '' && !ajustesPorCuenta[acc].memos.includes(t.descripcion.trim())) {
                            ajustesPorCuenta[acc].memos.push(t.descripcion.trim());
                        }
                    } else if (t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA') {
                        const isAjuste = t.categoria === 'Rendimiento Inversiones' || t.categoria === 'Ajuste Mercado' || t.categoria === 'Compra/Venta Divisas';
                        if (!isAjuste) {
                            if (expMap[t.categoria] !== undefined) {
                                expMap[t.categoria] += converted;
                            }
                        }
                    }
                }
            });
        }

        let categoriasMes = [];
        activeCats.forEach(c => {
            if (c === 'Ajuste Técnico Saldos') return;
            let meta = budMap[c] || 0;
            let gasto = expMap[c] || 0;
            if (meta > 0 || gasto > 0) {
                categoriasMes.push({ nombre: c, meta, gasto });
            }
        });

        const pesoEstado = { 'Target': 1, 'Riesgo': 2, 'Fuera': 3 };
        categoriasMes.sort((a, b) => {
            let estA = calcularEstadoRAG(a.meta, a.gasto);
            let estB = calcularEstadoRAG(b.meta, b.gasto);
            if (pesoEstado[estA] !== pesoEstado[estB]) {
                return pesoEstado[estA] - pesoEstado[estB];
            }
            return a.nombre.localeCompare(b.nombre);
        });

        // ENCABEZADO
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Informe de Auditoría y Desempeño Presupuestario', margin, cursorY);
        
        cursorY += 18;
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Período Auditado: ${periodoStr}  |  Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}`, margin, cursorY);
        
        cursorY += 22;

        // DICTAMEN DE AUDITORÍA
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, cursorY, anchoPagina - (margin * 2), 70, 'F');
        doc.setDrawColor(200, 205, 215);
        doc.rect(margin, cursorY, anchoPagina - (margin * 2), 70, 'S');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Dictamen de Auditoría y Calidad Contable', margin + 12, cursorY + 18);

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        let scoreText = `Score de Calidad: ${audit.score}/100 (${audit.ratingText})`;
        let checkPartida = audit.transferenciasHuerfanas.length === 0 ? "✓ Partida Doble OK" : "⚠ Transferencia Huérfana Detectada";
        let checkCuentas = audit.cuentasEnRojo.length === 0 ? "✓ Cajas en Positivo" : `⚠ Cuentas en rojo: ${audit.cuentasEnRojo.length}`;
        let checkDuplicados = audit.posiblesDuplicados.length === 0 ? "✓ Sin Duplicados" : "⚠ Posible duplicado registrado";

        doc.text(scoreText, margin + 12, cursorY + 36);
        doc.text(`${checkPartida}   |   ${checkCuentas}   |   ${checkDuplicados}`, margin + 12, cursorY + 52);

        cursorY += 88;

        // TABLA RAG
        let totalMeta = 0;
        let totalGasto = 0;
        let categoriasEnTarget = 0;

        const filasTabla = categoriasMes.map(cat => {
            totalMeta += cat.meta;
            totalGasto += cat.gasto;
            
            let desvioPct = 0;
            if (cat.meta > 0) {
                desvioPct = ((cat.gasto - cat.meta) / cat.meta) * 100;
            } else if (cat.meta === 0 && cat.gasto > 0) {
                desvioPct = 100;
            }

            let estado = calcularEstadoRAG(cat.meta, cat.gasto);
            if (estado === 'Target') categoriasEnTarget++;

            return [
                cat.nombre, 
                `$${cat.meta.toLocaleString('es-AR')}`, 
                `$${cat.gasto.toLocaleString('es-AR')}`, 
                `${desvioPct > 0 ? '+' : ''}${desvioPct.toFixed(1)}%`, 
                estado
            ];
        });

        if (filasTabla.length > 0) {
            doc.autoTable({
                startY: cursorY,
                head: [['Categoría', 'Meta', 'Gasto Real', 'Desvío (%)', 'Estado']],
                body: filasTabla,
                theme: 'grid',
                styles: {
                    font: 'helvetica',
                    fontSize: 9.5,
                    cellPadding: 5.5,
                    halign: 'center',
                    valign: 'middle'
                },
                headStyles: { 
                    fillColor: [41, 128, 185], 
                    halign: 'center',
                    fontStyle: 'bold',
                    fontSize: 10
                },
                columnStyles: {
                    0: { halign: 'center' },
                    1: { halign: 'center' },
                    2: { halign: 'center' },
                    3: { halign: 'center', fontStyle: 'bold' },
                    4: { halign: 'center', fontStyle: 'bold' }
                },
                margin: { left: margin, right: margin },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.index === 4) {
                        if (data.cell.raw === 'Fuera') data.cell.styles.textColor = [220, 20, 60];
                        else if (data.cell.raw === 'Riesgo') data.cell.styles.textColor = [218, 165, 32];
                        else if (data.cell.raw === 'Target') data.cell.styles.textColor = [34, 139, 34];
                    }
                }
            });

            cursorY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 30 : cursorY + 120;
        } else {
            doc.setFontSize(10);
            doc.text("No se registraron movimientos ni presupuestos asignados para este período.", margin, cursorY);
            cursorY += 30;
        }

        const crearImagenGrafico = async (config, altoCanvas = 380) => {
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            tempDiv.style.width = '700px';
            tempDiv.style.height = `${altoCanvas}px`;
            
            const canvas = document.createElement('canvas');
            canvas.width = 700;
            canvas.height = altoCanvas;
            tempDiv.appendChild(canvas);
            document.body.appendChild(tempDiv);

            const ctx = canvas.getContext('2d');
            config.options = config.options || {};
            config.options.animation = false;
            config.options.responsive = false;

            const chart = new window.Chart(ctx, config);
            await new Promise(r => setTimeout(r, 150));
            
            const imgData = chart.toBase64Image();
            chart.destroy();
            document.body.removeChild(tempDiv);
            return imgData;
        };

        // GRÁFICO 1: CATEGORÍAS
        if (categoriasMes.length > 0) {
            if (cursorY + 300 > altoPagina) {
                doc.addPage();
                cursorY = margin;
            }

            const configGrafico1 = {
                type: 'line',
                data: {
                    labels: categoriasMes.map(c => c.nombre),
                    datasets: [
                        { 
                            label: 'Presupuesto ($)', 
                            data: categoriasMes.map(c => c.meta), 
                            borderColor: '#2980b9', 
                            backgroundColor: '#2980b9',
                            showLine: false,
                            pointRadius: 3.5,
                            pointHoverRadius: 5
                        },
                        { 
                            label: 'Gasto Real ($)', 
                            data: categoriasMes.map(c => c.gasto), 
                            borderColor: '#e74c3c', 
                            backgroundColor: '#e74c3c',
                            showLine: false,
                            pointRadius: 3.5,
                            pointStyle: 'rectRot',
                            pointHoverRadius: 5
                        }
                    ]
                },
                options: { 
                    plugins: { 
                        title: { display: true, text: `Desempeño por Categoría (${periodoStr})`, font: { size: 13 } } 
                    },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: false,
                                maxRotation: 90,
                                minRotation: 90,
                                font: { size: 7.5, weight: 'bold' }
                            }
                        },
                        y: { beginAtZero: true }
                    }
                }
            };

            const imgChart1 = await crearImagenGrafico(configGrafico1, 380);
            doc.addImage(imgChart1, 'PNG', margin, cursorY, anchoPagina - (margin * 2), 270);
            cursorY += 285;
        }

        // GRÁFICO 2: TENDENCIA HISTÓRICA
        let historicalList = [];
        if (selector) {
            const options = Array.from(selector.options);
            const filteredOptions = options.filter(opt => opt.value >= '2026-07' && opt.value <= activeMonthFilter);
            const allBudgetsSource = state.allBudgetDataHistorico || state.globalBudgetData || [];

            filteredOptions.forEach(opt => {
                const periodVal = opt.value;
                const labelStr = opt.text;
                let metaSum = 0;
                let gastoSum = 0;

                let periodBudMap = {};
                let periodExpMap = {};
                activeCats.forEach(c => { periodBudMap[c] = 0; periodExpMap[c] = 0; });

                let periodRecords = allBudgetsSource.filter(b => b.periodo === periodVal);
                if (periodRecords.length === 0) {
                    const septRecords = allBudgetsSource.filter(b => b.periodo === '2026-09');
                    if (septRecords.length > 0) periodRecords = septRecords;
                    else {
                        const availablePeriods = [...new Set(allBudgetsSource.map(b => b.periodo).filter(Boolean))].sort();
                        if (availablePeriods.length > 0) periodRecords = allBudgetsSource.filter(b => b.periodo === availablePeriods[0]);
                    }
                }

                if (periodRecords && periodRecords.length > 0) {
                    periodRecords.forEach(b => {
                        if (periodBudMap[b.nombre] !== undefined) {
                            periodBudMap[b.nombre] = parseFloat(b.presupuesto_mensual) || 0;
                        }
                    });
                }

                if (state.globalTransData) {
                    state.globalTransData.forEach(t => {
                        if (t.fecha && t.fecha.substring(0, 7) === periodVal && t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA') {
                            const isAjuste = t.categoria === 'Rendimiento Inversiones' || t.categoria === 'Ajuste Mercado' || t.categoria === 'Ajuste Técnico Saldos' || t.categoria === 'Compra/Venta Divisas';
                            if (!isAjuste) {
                                const m = parseFloat(t.monto) || 0;
                                const converted = (t.moneda === 'USD') ? m * (t.tipo_cambio || TIPO_CAMBIO_PRESUPUESTO) : m;
                                if (periodExpMap[t.categoria] !== undefined) {
                                    periodExpMap[t.categoria] += converted;
                                }
                            }
                        }
                    });
                }

                activeCats.forEach(c => {
                    if (c !== 'Ajuste Técnico Saldos' && c !== 'Compra/Venta Divisas') {
                        metaSum += periodBudMap[c] || 0;
                        gastoSum += periodExpMap[c] || 0;
                    }
                });

                historicalList.push({ mes: labelStr, metaTotal: metaSum, gastoTotal: gastoSum });
            });
        }

        if (historicalList.length > 0) {
            if (cursorY + 230 > altoPagina) {
                doc.addPage();
                cursorY = margin;
            }

            const configGrafico2 = {
                type: 'line',
                data: {
                    labels: historicalList.map(h => h.mes),
                    datasets: [
                        { label: 'Gasto Total ($)', data: historicalList.map(h => h.gastoTotal), borderColor: '#e74c3c', backgroundColor: '#e74c3c', fill: false, tension: 0.1, pointRadius: 5 },
                        { label: 'Presupuesto Total ($)', data: historicalList.map(h => h.metaTotal), borderColor: '#2980b9', backgroundColor: '#2980b9', fill: false, tension: 0.1, pointRadius: 5 }
                    ]
                },
                options: { 
                    plugins: { 
                        title: { display: true, text: 'Tendencia Histórica Presupuesto vs. Gastos (Desde Julio 2026)', font: { size: 13 } } 
                    },
                    scales: { y: { beginAtZero: true } }
                }
            };

            const imgChart2 = await crearImagenGrafico(configGrafico2, 280);
            doc.addImage(imgChart2, 'PNG', margin, cursorY, anchoPagina - (margin * 2), 200);
            cursorY += 215;
        }

        // RESUMEN EJECUTIVO
        const desvioGlobalPct = totalMeta > 0 ? (((totalGasto - totalMeta) / totalMeta) * 100).toFixed(1) : 0;
        const estadoGlobal = totalGasto <= totalMeta ? 'AHORRO' : 'DÉFICIT';

        let lineasFuera = [];
        categoriasMes.forEach(cat => {
            let est = calcularEstadoRAG(cat.meta, cat.gasto);
            if (est === 'Fuera') {
                let exceso = cat.gasto - cat.meta;
                let descs = [];
                if (state.globalTransData) {
                    state.globalTransData.forEach(t => {
                        if (t.fecha && t.fecha.substring(0, 7) === activeMonthFilter &&
                            t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA' &&
                            t.categoria === cat.nombre) {
                            if (t.descripcion && t.descripcion.trim() !== '' && !descs.includes(t.descripcion.trim())) {
                                descs.push(t.descripcion.trim());
                            }
                        }
                    });
                }
                let descStr = descs.length > 0 ? `  |  Memos: "${descs.slice(0, 4).join('", "')}"` : '';
                lineasFuera.push(`${cat.nombre}: +$${exceso.toLocaleString('es-AR')}${descStr}`);
            }
        });

        let lineasAjustes = [];
        for (let acc in ajustesPorCuenta) {
            let data = ajustesPorCuenta[acc];
            if (data.neto !== 0 || data.memos.length > 0) {
                let absVal = Math.abs(data.neto);
                let signoVal = data.neto < 0 ? '-' : (data.neto > 0 ? '+' : '');
                let tipoStr = data.neto > 0 ? '(Sobrante neto)' : (data.neto < 0 ? '(Faltante neto)' : '(Sin impacto neto)');
                let memoStr = data.memos.length > 0 ? `  |  Motivos: "${data.memos.slice(0, 4).join('", "')}"` : '';
                lineasAjustes.push(`${acc}: ${signoVal}$${absVal.toLocaleString('es-AR')} ${tipoStr}${memoStr}`);
            }
        }

        let baseHeight = 125;
        const maxAnchoTextoBullet = anchoPagina - (margin * 2) - 34;

        let extraLinesCount = 0;
        lineasFuera.forEach(l => {
            let split = doc.splitTextToSize(l, maxAnchoTextoBullet);
            extraLinesCount += split.length;
        });
        let extraHeight = lineasFuera.length > 0 ? (26 + (lineasFuera.length * 16) + ((extraLinesCount - lineasFuera.length) * 11)) : 0;

        let extraLinesCountAjustes = 0;
        lineasAjustes.forEach(l => {
            let split = doc.splitTextToSize(l, maxAnchoTextoBullet);
            extraLinesCountAjustes += split.length;
        });
        let extraHeightAjustes = lineasAjustes.length > 0 ? (26 + (lineasAjustes.length * 16) + ((extraLinesCountAjustes - lineasAjustes.length) * 11)) : 0;

        let totalBoxHeight = baseHeight + extraHeight + extraHeightAjustes;

        if (cursorY + totalBoxHeight > altoPagina) {
            doc.addPage();
            cursorY = margin;
        }

        doc.setFillColor(240, 240, 240);
        doc.rect(margin, cursorY, anchoPagina - (margin * 2), totalBoxHeight, 'F');
        
        let textY = cursorY + 22;
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen Ejecutivo Global', margin + 12, textY);
        
        textY += 22;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Exactitud / Discrepancia del presupuesto:', margin + 12, textY);

        textY += 14;
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Presupuestado: $${totalMeta.toLocaleString('es-AR')}  |  Gastado: $${totalGasto.toLocaleString('es-AR')}`, margin + 12, textY);
        
        textY += 22;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Desvío del Mes: ${desvioGlobalPct > 0 ? '+' : ''}${desvioGlobalPct}% (${estadoGlobal})`, margin + 12, textY);
        
        textY += 14;
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Métrica de Eficiencia: Mantuviste ${categoriasEnTarget} de ${categoriasMes.length} categorías en Target seguro.`, margin + 12, textY);

        if (lineasFuera.length > 0) {
            textY += 24;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Detalle de Excesos en Categorías "Fuera":', margin + 12, textY);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            
            lineasFuera.forEach(linea => {
                textY += 16;
                doc.text('•', margin + 12, textY);
                let splitLines = doc.splitTextToSize(linea, maxAnchoTextoBullet);
                doc.text(splitLines, margin + 22, textY);
                if (splitLines.length > 1) {
                    textY += (splitLines.length - 1) * 11;
                }
            });
        }

        if (lineasAjustes.length > 0) {
            textY += 24;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Reconciliación y Ajustes Técnicos de Saldos:', margin + 12, textY);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            
            lineasAjustes.forEach(linea => {
                textY += 16;
                doc.text('•', margin + 12, textY);
                let splitLines = doc.splitTextToSize(linea, maxAnchoTextoBullet);
                doc.text(splitLines, margin + 22, textY);
                if (splitLines.length > 1) {
                    textY += (splitLines.length - 1) * 11;
                }
            });
        }

        const fileName = `Informe_Auditoria_SmartFinance_${periodoStr.replace(/\s+/g, '_')}.pdf`;
        doc.save(fileName);
        
        if (window.UI?.showToast) {
            window.UI.showToast("Reporte integral descargado con éxito");
        }

    } catch (err) {
        console.error("Error al generar PDF:", err);
        if (window.UI?.showAppAlert) {
            window.UI.showAppAlert("Error de Generación", "Ocurrió un error al procesar el PDF: " + err.message);
        }
    }
}
