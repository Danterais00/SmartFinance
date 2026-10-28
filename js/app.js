import { _supabase, fetchMarketData, TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';
import { 
    state, 
    CUENTAS_OPERATIVAS, 
    CUENTAS_COMITENTES, 
    CUENTAS_TARJETAS,
    CUENTAS_SISTEMA_TOTAL, 
    MESES_ES, 
    getLocalDateString, 
    getPreviousMonthStr, 
    saveOfflineQueue, 
    syncOfflineQueue, 
    fetchDynamicCategories 
} from './state.js';
import { 
    calcularEstadoRAG, 
    executeFinancialAuditEngine, 
    buildUnifiedTransactionBatch, 
    buildCreditCardClosingBatch 
} from './financeEngine.js';
import { 
    renderInteractiveChart, 
    renderInteractiveHistoryChart, 
    renderPortfolioPieChart, 
    renderSavingsPatrimonialTab, 
    toggleInteractiveScale, 
    resetInteractiveZoom, 
    resetInteractiveHistoryZoom,
    zoomPerformanceChart,
    zoomHistoryChart
} from './charts.js';
import { exportAuditPDF } from './pdfReport.js';
import { parseVisaStatement } from './statementImporter.js';

let parsedStatementItems = [];

function isDateWithinRange(targetDateStr, baseDateStr, daysBefore = 20, daysAfter = 15) {
    if (!targetDateStr || !baseDateStr) return false;
    const target = new Date(targetDateStr + 'T00:00:00');
    const base = new Date(baseDateStr + 'T00:00:00');
    if (isNaN(target.getTime()) || isNaN(base.getTime())) return false;
    const diffDays = (target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= -daysBefore && diffDays <= daysAfter;
}

// EXPOSICIÓN GLOBAL UI
window.UI = {
    showToast(message, isError = false) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.innerHTML = `<i class="fa-solid ${isError ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.4s forwards';
            setTimeout(() => toast.remove(), 400);
        }, 3200);
    },

    showAppAlert(title, message) {
        const modal = document.getElementById('global-alert-modal');
        const t = document.getElementById('global-alert-title');
        const m = document.getElementById('global-alert-message');
        if (t) t.innerText = title;
        if (m) m.innerText = message;
        if (modal) modal.classList.add('is-open');
    },

    showAppConfirm(title, message, onConfirm) {
        const modal = document.getElementById('global-confirm-modal');
        const t = document.getElementById('global-confirm-title');
        const m = document.getElementById('global-confirm-message');
        const btnAction = document.getElementById('btn-confirm-action');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        if (t) t.innerText = title;
        if (m) m.innerText = message;
        if (modal) modal.classList.add('is-open');

        const cleanup = () => {
            if (modal) modal.classList.remove('is-open');
            btnAction.onclick = null;
            btnCancel.onclick = null;
        };

        btnAction.onclick = () => {
            cleanup();
            if (onConfirm) onConfirm();
        };
        btnCancel.onclick = cleanup;
    },

    closeModal(modalId) {
        const m = document.getElementById(modalId);
        if (m) m.classList.remove('is-open');
        if (modalId === 'edit-transaction-modal') {
            state.editingTransactionId = null;
        }
    },

    openModal(modalId) {
        const m = document.getElementById(modalId);
        if (m) m.classList.add('is-open');
    },

    selectActionType(type, buttonEl) {
        const pills = document.querySelectorAll('#action-type-selector-group .btn-type-pill');
        pills.forEach(b => b.classList.remove('active'));

        if (buttonEl) {
            buttonEl.classList.add('active');
        } else {
            const target = document.querySelector(`#action-type-selector-group .btn-type-pill[data-type="${type}"]`);
            if (target) target.classList.add('active');
        }

        const uniTipo = document.getElementById('uni-tipo');
        if (uniTipo) uniTipo.value = type;

        if (typeof window.updateUnifiedFormUI === 'function') window.updateUnifiedFormUI();
    },

    editBudgetDirect(catName, currentMeta) {
        const titleEl = document.getElementById('modal-edit-budget-title');
        const hiddenCat = document.getElementById('edit-budget-cat-name');
        const inputAmount = document.getElementById('edit-budget-amount');

        if (titleEl) titleEl.innerText = `Ajustar: ${catName}`;
        if (hiddenCat) hiddenCat.value = catName;
        if (inputAmount) inputAmount.value = currentMeta;
        window.UI.openModal('modal-edit-budget');
    },

    deleteBudgetDirect(catName) {
        const selector = document.getElementById('global-month-selector');
        const periodo = selector ? selector.value : getLocalDateString().substring(0, 7);

        window.UI.showAppConfirm("Eliminar Presupuesto", `¿Deseas quitar la meta asignada a "${catName}" para el período ${periodo}?`, async () => {
            const { error } = await _supabase.from('categorias').delete().eq('user_id', state.currentUser.id).eq('nombre', catName).eq('periodo', periodo);
            if (error) { window.UI.showAppAlert("Error", error.message); } 
            else { window.UI.showToast(`Presupuesto eliminado`); loadUserDataFromDatabase(); }
        });
    },

    payPendingAlert(categoria, monto) {
        window.UI.closeModal('notifications-modal-center');
        switchView('view-rapido', 'btn-nav-rapido');
        window.UI.selectActionType('GASTO');

        const elCat = document.getElementById('uni-categoria');
        const elMonto = document.getElementById('uni-monto');
        const elConcepto = document.getElementById('uni-concepto');

        if (elCat) elCat.value = categoria;
        if (elMonto) elMonto.value = monto;
        if (elConcepto) elConcepto.value = `Pago vencimiento: ${categoria}`;
        if (typeof window.updateUnifiedFormUI === 'function') window.updateUnifiedFormUI();
    },

    openEditTransactionModal(id) {
        const t = state.globalTransData.find(item => String(item.id) === String(id));
        if (!t) {
            window.UI.showAppAlert("Error", "No se encontró el registro seleccionado para editar.");
            return;
        }

        state.editingTransactionId = t.id;

        const fFecha = document.getElementById('edit-form-fecha');
        const fImporte = document.getElementById('edit-form-importe');
        const fConcepto = document.getElementById('edit-form-concepto');
        const fMetodo = document.getElementById('edit-form-metodo');
        const fCategoria = document.getElementById('edit-form-categoria');
        const fMoneda = document.getElementById('edit-form-moneda');
        const fPresup = document.getElementById('edit-form-presupuestado');
        const fEsCredito = document.getElementById('edit-form-es-credito');

        const rawMonto = parseFloat(t.monto) || 0;

        if (fFecha) fFecha.value = t.fecha || getLocalDateString();
        if (fImporte) fImporte.value = Math.abs(rawMonto);
        if (fConcepto) fConcepto.value = t.descripcion || '';
        if (fMetodo) fMetodo.value = t.cuenta || '';
        if (fCategoria) fCategoria.value = t.categoria || '';
        if (fMoneda) fMoneda.value = t.moneda || 'ARS';
        if (fPresup) fPresup.value = t.presupuestado || 'SI';
        if (fEsCredito) fEsCredito.value = (rawMonto < 0) ? 'true' : 'false';

        window.UI.openModal('edit-transaction-modal');
    },

    deleteTransaction(id) {
        const t = state.globalTransData.find(item => String(item.id) === String(id));
        if (!t) {
            window.UI.showAppAlert("Error", "No se encontró el movimiento a eliminar.");
            return;
        }

        const isTransfer = !!t.transfer_group_id;
        const montoNum = Math.abs(parseFloat(t.monto) || 0);
        const sym = t.moneda === 'USD' ? 'u$d' : '$';

        const titulo = isTransfer ? "Eliminar Movimiento Vinculado" : "Eliminar Movimiento";
        const mensaje = isTransfer
            ? `Este registro forma parte de una transferencia o cancelación de tarjeta ("${t.descripcion || 'Sin detalle'}"). ¿Deseas eliminar ambas patas de la operación para mantener la partida doble cuadrada?`
            : `¿Deseas eliminar permanentemente el registro "${t.descripcion || 'Sin detalle'}" por ${sym} ${montoNum.toLocaleString('es-AR')}?`;

        window.UI.showAppConfirm(titulo, mensaje, async () => {
            try {
                let res;
                if (isTransfer) {
                    res = await _supabase.from('transacciones').delete().eq('transfer_group_id', t.transfer_group_id);
                } else {
                    res = await _supabase.from('transacciones').delete().eq('id', t.id);
                }

                if (res.error) throw res.error;

                window.UI.showToast(isTransfer ? "Operación doble eliminada con éxito" : "Movimiento eliminado con éxito");
                await loadUserDataFromDatabase();
            } catch (err) {
                console.error("Error al eliminar movimiento:", err);
                window.UI.showAppAlert("Error al Eliminar", err.message);
            }
        });
    },

    toggleChat() {
        const panel = document.getElementById('chat-panel');
        const overlay = document.getElementById('chat-overlay');
        if (panel.classList.contains('is-open')) {
            panel.classList.remove('is-open');
            overlay.classList.remove('is-active');
        } else {
            panel.classList.add('is-open');
            overlay.classList.add('is-active');
            setTimeout(() => document.getElementById('chat-input')?.focus(), 300);
        }
    },

    sendDummyMessage(forcedText) {
        const input = document.getElementById('chat-input');
        const text = forcedText || input.value.trim();
        if (!text) return;
        
        const chatBody = document.getElementById('chat-body');
        chatBody.innerHTML += `
            <div class="chat-msg user">
                <div class="msg-bubble">${text}</div>
                <div class="chat-time">Ahora</div>
            </div>
        `;
        input.value = "";
        chatBody.scrollTop = chatBody.scrollHeight;

        setTimeout(() => {
            chatBody.innerHTML += `
                <div class="chat-msg bot">
                    <div class="msg-bubble"><em>[Modo Diseño]</em> Entiendo tu consulta sobre: "<strong>${text}</strong>". Próximamente me conectarán a la base de conocimiento de Supabase para responderte con exactitud.</div>
                    <div class="chat-time">Ahora</div>
                </div>
            `;
            chatBody.scrollTop = chatBody.scrollHeight;
        }, 800);
    }
};

function switchView(targetViewId, targetTabBtnId) {
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.mobile-tab-bar .tab-item').forEach(b => b.classList.remove('active'));
    document.getElementById(targetViewId)?.classList.add('active');
    document.getElementById(targetTabBtnId)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchSubTab(targetSubViewId, targetSubBtnId) {
    document.querySelectorAll('.subview-content').forEach(sv => sv.classList.remove('active'));
    document.querySelectorAll('.subtabs-nav .subtab-link').forEach(btn => btn.classList.remove('active'));
    document.getElementById(targetSubViewId)?.classList.add('active');
    document.getElementById(targetSubBtnId)?.classList.add('active');
    if (targetSubViewId === 'subview-graficos') {
        renderInteractiveChart(state.cachedCategoriesDataForChart);
        renderInteractiveHistoryChart(state.cachedHistoricalDataForChart);
    }
}

function initMonthSelector() {
    const selector = document.getElementById('global-month-selector');
    const importMonthSelector = document.getElementById('import-target-period');
    if (!selector) return;
    const prevVal = selector.value;
    selector.innerHTML = "";
    if (importMonthSelector) importMonthSelector.innerHTML = "";

    const fechaBase = new Date(2026, 6, 1);
    const fechaActual = new Date();
    const fechaLimiteFutura = new Date(fechaActual.getFullYear(), fechaActual.getMonth() + 12, 1);
    let currentIter = new Date(fechaBase);
    let opciones = [];
    while (currentIter <= fechaLimiteFutura) {
        const y = currentIter.getFullYear();
        const m = String(currentIter.getMonth() + 1).padStart(2, '0');
        const val = `${y}-${m}`;
        const label = `${MESES_ES[currentIter.getMonth()]} ${y}`;
        opciones.unshift({ val, label });
        currentIter.setMonth(currentIter.getMonth() + 1);
    }
    opciones.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.val; o.innerText = opt.label;
        selector.appendChild(o);

        if (importMonthSelector) {
            const o2 = document.createElement('option');
            o2.value = opt.val; o2.innerText = opt.label;
            importMonthSelector.appendChild(o2);
        }
    });

    const mesActualStr = getLocalDateString().substring(0, 7);
    if (prevVal && Array.from(selector.options).some(o => o.value === prevVal)) {
        selector.value = prevVal;
        if (importMonthSelector) importMonthSelector.value = prevVal;
    } else if (Array.from(selector.options).some(o => o.value === mesActualStr)) {
        selector.value = mesActualStr;
        if (importMonthSelector) importMonthSelector.value = mesActualStr;
    }
}

function populateSelectOptions() {
    const fillSelect = (id, options, keepFirst = false) => {
        const el = document.getElementById(id);
        if (!el) return;
        const firstOpt = keepFirst ? el.options[0] : null;
        el.innerHTML = "";
        if (firstOpt) el.appendChild(firstOpt);
        options.forEach(opt => { const o = document.createElement('option'); o.value = opt; o.innerText = opt; el.appendChild(o); });
    };
    fillSelect('uni-origen', CUENTAS_SISTEMA_TOTAL);
    fillSelect('uni-destino', CUENTAS_SISTEMA_TOTAL);
    fillSelect('uni-categoria', state.misCategoriasUnificadas);
    fillSelect('pre-cat', state.misCategoriasUnificadas);
    fillSelect('audit-cuenta', CUENTAS_OPERATIVAS);
    fillSelect('edit-form-metodo', CUENTAS_SISTEMA_TOTAL);
    fillSelect('edit-form-categoria', state.misCategoriasUnificadas);
    fillSelect('close-card-select', CUENTAS_TARJETAS);
    fillSelect('import-target-card', CUENTAS_TARJETAS);
    fillSelect('filter-cuenta', CUENTAS_SISTEMA_TOTAL, true);
    fillSelect('filter-categoria', state.misCategoriasUnificadas, true);
}

// CÁLCULO CONTABLE EXACTO Y CONSOLIDACIÓN BIMONETARIA
function recalculateFinancialMetrics() {
    const selector = document.getElementById('global-month-selector');
    const activeMonth = selector ? selector.value : getLocalDateString().substring(0, 7);

    state.currentAccountBalancesARS = {}; state.currentAccountBalancesUSD = {};
    state.brokerEarningsARS = {}; state.brokerEarningsUSD = {};
    state.creditCardDebtARS = {}; state.creditCardDebtUSD = {};

    CUENTAS_SISTEMA_TOTAL.forEach(acc => { state.currentAccountBalancesARS[acc] = 0; state.currentAccountBalancesUSD[acc] = 0; });
    CUENTAS_COMITENTES.forEach(b => { state.brokerEarningsARS[b] = 0; state.brokerEarningsUSD[b] = 0; });
    CUENTAS_TARJETAS.forEach(c => { state.creditCardDebtARS[c] = 0; state.creditCardDebtUSD[c] = 0; });

    let totalIngresosMes = 0;
    let totalGastosPresupuestados = 0; 
    let totalEgresosRealesMes = 0;      
    let totalPlanificadoMes = 0;
    let catGastosMap = {}; 
    state.misCategoriasUnificadas.forEach(c => { catGastosMap[c] = 0; });

    state.globalTransData.forEach(t => {
        const monto = parseFloat(t.monto) || 0;
        const isCurrentMonth = t.fecha && t.fecha.substring(0, 7) === activeMonth;
        
        const appliedFx = (parseFloat(t.tipo_cambio) > 0) ? parseFloat(t.tipo_cambio) : TIPO_CAMBIO_PRESUPUESTO;
        const convUSD = (t.moneda === 'USD') ? monto * appliedFx : monto;
        const esTarjeta = CUENTAS_TARJETAS.includes(t.cuenta);

        if (esTarjeta) {
            if (t.moneda === 'USD') { 
                if (t.tipo === 'gasto') state.creditCardDebtUSD[t.cuenta] += monto; 
                else if (t.tipo === 'ingreso') state.creditCardDebtUSD[t.cuenta] -= monto; 
            } else { 
                if (t.tipo === 'gasto') state.creditCardDebtARS[t.cuenta] += monto; 
                else if (t.tipo === 'ingreso') state.creditCardDebtARS[t.cuenta] -= monto; 
            }
        } else {
            if (t.moneda === 'USD') { 
                if (t.tipo === 'ingreso') state.currentAccountBalancesUSD[t.cuenta] += monto; 
                else if (t.tipo === 'gasto') state.currentAccountBalancesUSD[t.cuenta] -= monto; 
            } else { 
                if (t.tipo === 'ingreso') state.currentAccountBalancesARS[t.cuenta] += monto; 
                else if (t.tipo === 'gasto') state.currentAccountBalancesARS[t.cuenta] -= monto; 
            }
        }

        if (isCurrentMonth) {
            if (t.categoria === 'Rendimiento Inversiones') {
                if (t.moneda === 'USD') state.brokerEarningsUSD[t.cuenta] += monto;
                else state.brokerEarningsARS[t.cuenta] += monto;
            }

            const esTransferenciaOPago = (
                t.categoria === 'Transferencia Interna' || 
                t.categoria === 'Compra/Venta Divisas' || 
                t.categoria === 'Pago Tarjeta de Crédito' || 
                t.categoria === 'Ajuste Técnico Saldos'
            );

            if (t.tipo === 'ingreso' && !esTransferenciaOPago) {
                totalIngresosMes += convUSD;
            } else if (t.tipo === 'gasto' && !esTransferenciaOPago) {
                totalEgresosRealesMes += convUSD;

                if (t.presupuestado !== 'NO_COMPUTA') {
                    totalGastosPresupuestados += convUSD;
                    if (catGastosMap[t.categoria] !== undefined) {
                        catGastosMap[t.categoria] += convUSD;
                    }
                }
            }
        }
    });

    let catMetaMap = {}; state.misCategoriasUnificadas.forEach(c => { catMetaMap[c] = 0; });
    state.globalBudgetData.forEach(b => {
        const val = parseFloat(b.presupuesto_mensual) || 0;
        totalPlanificadoMes += val;
        if (catMetaMap[b.nombre] !== undefined) catMetaMap[b.nombre] = val;
    });

    const cuentasActivoUnicas = [...new Set([...CUENTAS_OPERATIVAS, ...CUENTAS_COMITENTES])];
    let totalActivos = 0; 
    cuentasActivoUnicas.forEach(acc => { 
        totalActivos += (state.currentAccountBalancesARS[acc] || 0) + ((state.currentAccountBalancesUSD[acc] || 0) * TIPO_CAMBIO_PRESUPUESTO); 
    });

    let liquidezDisponible = 0; 
    CUENTAS_OPERATIVAS.forEach(acc => { 
        liquidezDisponible += (state.currentAccountBalancesARS[acc] || 0) + ((state.currentAccountBalancesUSD[acc] || 0) * TIPO_CAMBIO_PRESUPUESTO); 
    });

    let deudaTarjetasTotal = 0; 
    CUENTAS_TARJETAS.forEach(c => { 
        deudaTarjetasTotal += (state.creditCardDebtARS[c] || 0) + ((state.creditCardDebtUSD[c] || 0) * TIPO_CAMBIO_PRESUPUESTO); 
    });

    let patrimonioNeto = totalActivos - deudaTarjetasTotal;
    let ahorroMes = totalIngresosMes - totalEgresosRealesMes;

    const setCard = (id, mainText, subText = '', subColor = '') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<span class="main-val">${mainText}</span>${subText ? `<span class="sub-val" ${subColor ? `style="color: ${subColor} !important;"` : ''}>${subText}</span>` : ''}`;
    };

    let subPatrimonio = 'Sin pasivos'; 
    let colorPatrimonio = 'var(--text-muted)';
    if (deudaTarjetasTotal > 0) { 
        subPatrimonio = `Pasivo: -$${Math.round(deudaTarjetasTotal).toLocaleString('es-AR')}`; 
        colorPatrimonio = 'var(--danger)'; 
    } else if (deudaTarjetasTotal < 0) { 
        subPatrimonio = `Saldo a favor: +$${Math.round(Math.abs(deudaTarjetasTotal)).toLocaleString('es-AR')}`; 
        colorPatrimonio = 'var(--primary)'; 
    }

    const extraPresupuesto = totalEgresosRealesMes - totalGastosPresupuestados;
    const subGastos = (extraPresupuesto > 1.0) 
        ? `Pptado: $${Math.round(totalGastosPresupuestados).toLocaleString('es-AR')}` 
        : '100% presupuestado';

    setCard('metric-patrimonio', `$${Math.round(patrimonioNeto).toLocaleString('es-AR')}`, subPatrimonio, colorPatrimonio);
    setCard('metric-ingresos', `$${Math.round(totalIngresosMes).toLocaleString('es-AR')}`);
    setCard('metric-presupuesto', `$${Math.round(totalPlanificadoMes).toLocaleString('es-AR')}`);
    setCard('metric-gastos', `$${Math.round(totalEgresosRealesMes).toLocaleString('es-AR')}`, subGastos, 'var(--text-muted)');
    setCard('metric-ahorro', `$${Math.round(ahorroMes).toLocaleString('es-AR')}`, ahorroMes >= 0 ? 'Superávit Real' : 'Déficit Real', ahorroMes >= 0 ? 'var(--primary)' : 'var(--danger)');
    setCard('metric-disponible', `$${Math.round(liquidezDisponible).toLocaleString('es-AR')}`);

    // CONSOLIDACIÓN EXACTA BIMONETARIA EN EL DONUT
    renderPortfolioPieChart(state.currentAccountBalancesARS, state.currentAccountBalancesUSD, TIPO_CAMBIO_PRESUPUESTO);
    renderSavingsPatrimonialTab(state.currentAccountBalancesARS, state.currentAccountBalancesUSD, state.brokerEarningsARS, state.brokerEarningsUSD);

    let categoriesMes = [];
    state.misCategoriasUnificadas.forEach(c => {
        if (c === 'Ajuste Técnico Saldos') return;
        let meta = catMetaMap[c] || 0; 
        let gasto = catGastosMap[c] || 0;
        if (meta > 0 || gasto > 0) {
            categoriesMes.push({ nombre: c, meta, gasto, estado: calcularEstadoRAG(meta, gasto) });
        }
    });

    renderAccuracyTable(categoriesMes);
    renderInteractiveChart(categoriesMes);
    buildHistoricalChartData();
    checkRemindersAndAlerts(catGastosMap);
}

function renderAccuracyTable(categoriesMes) {
    const tbody = document.getElementById('accuracy-body-real');
    if (!tbody) return;
    tbody.innerHTML = "";
    if (categoriesMes.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">Sin registros ni presupuesto activo para este período.</td></tr>`; 
        return; 
    }
    categoriesMes.forEach(c => {
        const badgeColor = c.estado === 'Target' ? 'var(--primary)' : (c.estado === 'Riesgo' ? 'var(--warning)' : 'var(--danger)');
        tbody.innerHTML += `<tr><td style="font-weight:600;">${c.nombre}</td><td style="text-align:right;">$${c.meta.toLocaleString('es-AR')}</td><td style="text-align:right; font-weight:700;">$${c.gasto.toLocaleString('es-AR')}</td><td style="text-align:center;"><span style="color:${badgeColor}; font-weight:700;">● ${c.estado}</span></td><td style="text-align:center; white-space:nowrap;"><button class="btn-action" onclick="window.UI.editBudgetDirect('${c.nombre}', ${c.meta})"><i class="fa-solid fa-pen-to-square"></i></button><button class="btn-delete" onclick="window.UI.deleteBudgetDirect('${c.nombre}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
}

function buildHistoricalChartData() {
    const selector = document.getElementById('global-month-selector');
    if (!selector) return;
    const options = Array.from(selector.options).filter(opt => opt.value >= '2026-07' && opt.value <= selector.value);
    let historicalList = [];
    options.forEach(opt => {
        let metaSum = 0; let gastoSum = 0;
        state.allBudgetDataHistorico.filter(b => b.periodo === opt.value).forEach(b => metaSum += parseFloat(b.presupuesto_mensual) || 0);
        state.globalTransData.filter(t => t.fecha && t.fecha.substring(0, 7) === opt.value && t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA' && t.categoria !== 'Transferencia Interna' && t.categoria !== 'Compra/Venta Divisas' && t.categoria !== 'Pago Tarjeta de Crédito' && t.categoria !== 'Ajuste Técnico Saldos').forEach(t => {
            const m = parseFloat(t.monto) || 0; 
            const fx = (parseFloat(t.tipo_cambio) > 0) ? parseFloat(t.tipo_cambio) : TIPO_CAMBIO_PRESUPUESTO;
            gastoSum += (t.moneda === 'USD') ? m * fx : m;
        });
        historicalList.push({ mes: opt.text, metaTotal: metaSum, gastoTotal: gastoSum });
    });
    renderInteractiveHistoryChart(historicalList);
}

function renderTransactionHistoryTable(dataset) {
    const tbody = document.getElementById('table-body-real-movs');
    if (!tbody) return;
    tbody.innerHTML = "";
    const list = dataset || [];
    if (list.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No se encontraron movimientos.</td></tr>`; 
        return; 
    }
    
    list.slice(0, 150).forEach(t => {
        const numMonto = parseFloat(t.monto) || 0;
        const isNegExpense = (t.tipo === 'gasto' && numMonto < 0);
        const isIngreso = (t.tipo === 'ingreso' || isNegExpense);
        const color = isIngreso ? 'var(--primary)' : 'var(--danger)';
        const sign = (numMonto < 0) ? '-' : (t.tipo === 'ingreso' ? '+' : '-');
        const sym = t.moneda === 'USD' ? 'u$d' : '$';
        const displayMonto = Math.abs(numMonto).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        const author = t.autor ? (t.autor.includes('dante') ? 'Dante' : 'Lore') : 'Dante';
        const reintegroBadge = isNegExpense ? `<span style="font-size:9.5px; color:var(--primary); font-weight:700; margin-left:4px;">[Reintegro]</span>` : '';

        tbody.innerHTML += `<tr>
            <td>${t.fecha}</td>
            <td style="font-weight:500;">${t.descripcion || '-'} ${reintegroBadge}</td>
            <td style="color:${color}; font-weight:700;">${sign} ${sym} ${displayMonto}</td>
            <td>${t.cuenta}</td>
            <td><span style="font-size:11px; background:var(--bg-card); padding:3px 8px; border-radius:6px; border:1px solid var(--border-color);">${t.categoria}</span></td>
            <td>${author}</td>
            <td style="text-align:center;">
                <button class="btn-action" onclick="window.UI.openEditTransactionModal('${t.id}')" title="Editar Movimiento"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-delete" onclick="window.UI.deleteTransaction('${t.id}')" title="Eliminar Movimiento"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });
}

const applyFilters = () => {
    const selector = document.getElementById('global-month-selector');
    const activeMonth = selector ? selector.value : getLocalDateString().substring(0, 7);
    const badge = document.getElementById('historial-period-badge');
    if (badge && selector && selector.selectedIndex >= 0) badge.innerText = `Período: ${selector.options[selector.selectedIndex].text}`;
    const query = document.getElementById('filter-search')?.value.toLowerCase() || '';
    const fTipo = document.getElementById('filter-tipo')?.value || 'TODOS';
    const fCuenta = document.getElementById('filter-cuenta')?.value || 'TODOS';
    const fCat = document.getElementById('filter-categoria')?.value || 'TODOS';
    const fAutor = document.getElementById('filter-autor')?.value || 'TODOS';
    const filtrados = state.globalTransData.filter(t => {
        const matchMonth = (t.fecha && t.fecha.substring(0, 7) === activeMonth);
        const matchQuery = (t.descripcion || '').toLowerCase().includes(query) || (t.categoria || '').toLowerCase().includes(query) || String(t.monto).includes(query);
        const matchTipo = (fTipo === 'TODOS') || (t.tipo === fTipo);
        const matchCuenta = (fCuenta === 'TODOS') || (t.cuenta === fCuenta);
        const matchCat = (fCat === 'TODOS') || (t.categoria === fCat);
        const matchAutor = (fAutor === 'TODOS') || (fAutor === 'dante' && (t.autor || '').includes('dante')) || (fAutor === 'lore' && (t.autor || '').includes('lore'));
        return matchMonth && matchQuery && matchTipo && matchCuenta && matchCat && matchAutor;
    });
    renderTransactionHistoryTable(filtrados);
};

function checkRemindersAndAlerts(catGastosMap = {}) {
    const today = getLocalDateString();
    const selector = document.getElementById('global-month-selector');
    const activeMonth = selector ? selector.value : getLocalDateString().substring(0, 7);

    state.currentMonthAlertsCache = [];
    const paidCommitments = [];

    state.globalBudgetData.forEach(b => {
        if (!b.fecha_vencimiento) return;

        const montoPresupuestado = parseFloat(b.presupuesto_mensual) || 0;
        const bNombreLower = b.nombre.toLowerCase().trim();
        let totalPagadoDetectado = 0;
        let fechaPagoDetectada = null;

        state.globalTransData.forEach(t => {
            const tMonto = parseFloat(t.monto) || 0;
            const tDesc = (t.descripcion || '').toLowerCase();
            const tCat = (t.categoria || '').toLowerCase();
            const tCuenta = (t.cuenta || '').toLowerCase();

            const matchFecha = isDateWithinRange(t.fecha, b.fecha_vencimiento, 20, 15) || 
                               (t.fecha && t.fecha.substring(0, 7) === activeMonth);

            if (!matchFecha) return;

            const matchCat = (tCat === bNombreLower);
            const matchDesc = tDesc.includes(bNombreLower) || 
                              (bNombreLower.includes('cafar') && tDesc.includes('cafar')) ||
                              (bNombreLower.includes('naturgy') && tDesc.includes('naturgy')) ||
                              (bNombreLower.includes('edenor') && tDesc.includes('edenor')) ||
                              (bNombreLower.includes('wellspring') && tDesc.includes('wellspring'));

            const matchTarjeta = (bNombreLower.includes('santander') && (tCuenta.includes('santander') || tDesc.includes('santander'))) ||
                                 (bNombreLower.includes('mercado pago') && (tCuenta.includes('mercado pago') || tDesc.includes('mercado pago')));

            if (t.tipo === 'gasto' && (matchCat || matchDesc)) {
                totalPagadoDetectado += Math.abs(tMonto);
                if (!fechaPagoDetectada || t.fecha > fechaPagoDetectada) fechaPagoDetectada = t.fecha;
            } else if (matchTarjeta && (t.categoria === 'Pago Tarjeta de Crédito' || t.categoria === 'Transferencia Interna' || matchDesc)) {
                totalPagadoDetectado += Math.abs(tMonto);
                if (!fechaPagoDetectada || t.fecha > fechaPagoDetectada) fechaPagoDetectada = t.fecha;
            }
        });

        const esTarjeta = bNombreLower.includes('tarjeta');
        let deudaTarjeta = 999999;
        if (esTarjeta) {
            CUENTAS_TARJETAS.forEach(c => {
                if (bNombreLower.includes(c.toLowerCase()) || c.toLowerCase().includes(bNombreLower)) {
                    deudaTarjeta = (state.creditCardDebtARS[c] || 0) + ((state.creditCardDebtUSD[c] || 0) * TIPO_CAMBIO_PRESUPUESTO);
                }
            });
        }

        const isPaid = (totalPagadoDetectado > 0) || 
                       (montoPresupuestado <= 0) || 
                       (esTarjeta && deudaTarjeta <= 0);

        if (isPaid) {
            paidCommitments.push({
                categoria: b.nombre,
                monto: montoPresupuestado > 0 ? montoPresupuestado : totalPagadoDetectado,
                fechaVto: b.fecha_vencimiento,
                fechaPago: fechaPagoDetectada,
                totalPagado: totalPagadoDetectado
            });
        } else {
            let status = 'upcoming';
            if (b.fecha_vencimiento < today) status = 'overdue';
            else if (b.fecha_vencimiento === today) status = 'today';

            state.currentMonthAlertsCache.push({
                categoria: b.nombre,
                monto: montoPresupuestado,
                fechaRaw: b.fecha_vencimiento,
                fechaFormateada: b.fecha_vencimiento,
                status
            });
        }
    });

    const badge = document.getElementById('global-bell-badge');
    const bellIcon = document.getElementById('global-bell-vector');
    const listContainer = document.getElementById('notifications-center-list-container');

    if (state.currentMonthAlertsCache.length > 0) {
        if (badge) {
            badge.style.display = 'flex';
            badge.innerText = state.currentMonthAlertsCache.length;
        }
        if (bellIcon) bellIcon.classList.add('fa-shake');
    } else {
        if (badge) badge.style.display = 'none';
        if (bellIcon) bellIcon.classList.remove('fa-shake');
    }

    if (listContainer) {
        listContainer.innerHTML = "";

        if (state.currentMonthAlertsCache.length === 0 && paidCommitments.length > 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 20px 10px 15px 10px;">
                    <i class="fa-solid fa-circle-check" style="font-size: 38px; color: var(--primary); margin-bottom: 10px;"></i>
                    <h4 style="font-size: 15px; color: #fff; margin-bottom: 4px;">¡Todos los compromisos al día!</h4>
                    <p style="font-size: 12px; color: var(--text-muted);">No tenés vencimientos pendientes para este mes.</p>
                </div>
            `;
        } else if (state.currentMonthAlertsCache.length === 0 && paidCommitments.length === 0) {
            listContainer.innerHTML = `<p style="font-size:13px; color:var(--text-muted); text-align:center; padding:25px;">Sin compromisos planificados para este mes.</p>`;
        }

        if (state.currentMonthAlertsCache.length > 0) {
            state.currentMonthAlertsCache.forEach(a => {
                listContainer.innerHTML += `
                    <div class="alert-item-row ${a.status}">
                        <div>
                            <div style="font-weight:700; font-size:13px; color:#fff;">${a.categoria}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Vencimiento: ${a.fechaFormateada}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="font-weight:700; color:var(--warning); font-size:14px;">$${Number(a.monto).toLocaleString('es-AR')}</div>
                            <button type="button" class="btn btn-sm" onclick="window.UI.payPendingAlert('${a.categoria}', ${a.monto})" style="background:var(--blue); padding:6px 12px; font-size:11px;">
                                <i class="fa-solid fa-arrow-right"></i> Pagar
                            </button>
                        </div>
                    </div>`;
            });
        }

        if (paidCommitments.length > 0) {
            let paidHTML = `
                <div style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 12px;">
                    <div style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; letter-spacing: 0.5px;">
                        <i class="fa-solid fa-circle-check"></i> Pagados este mes (${paidCommitments.length})
                    </div>
            `;
            paidCommitments.forEach(p => {
                const subText = p.fechaPago ? `Abonado el ${p.fechaPago}` : `Vencimiento cubierto (${p.fechaVto})`;
                paidHTML += `
                    <div class="alert-item-row paid">
                        <div>
                            <div style="font-weight:600; font-size:12.5px; color:#fff;">${p.categoria}</div>
                            <div style="font-size:10.5px; color:var(--text-muted);">${subText}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="font-weight:700; color:var(--primary); font-size:13px;">$${Number(p.monto).toLocaleString('es-AR')}</div>
                            <span style="font-size:11px; color:var(--primary);"><i class="fa-solid fa-check"></i></span>
                        </div>
                    </div>
                `;
            });
            paidHTML += `</div>`;
            listContainer.innerHTML += paidHTML;
        }
    }
}

async function loadUserDataFromDatabase() {
    if (!state.currentUser) return;
    try {
        await fetchDynamicCategories();
        populateSelectOptions();
        const selector = document.getElementById('global-month-selector');
        const activeMonth = selector ? selector.value : getLocalDateString().substring(0, 7);
        const [tRes, bMesRes, bHistRes] = await Promise.all([
            _supabase.from('transacciones').select('*').order('fecha', { ascending: false }),
            _supabase.from('categorias').select('*').eq('periodo', activeMonth),
            _supabase.from('categorias').select('*')
        ]);
        if (tRes.error) throw tRes.error; if (bMesRes.error) throw bMesRes.error; if (bHistRes.error) throw bHistRes.error;
        state.globalTransData = tRes.data || []; state.globalBudgetData = bMesRes.data || []; state.allBudgetDataHistorico = bHistRes.data || [];
        recalculateFinancialMetrics(); applyFilters();
    } catch (err) { window.UI.showToast("Error de conexión", true); }
}

function updateStagingTotals() {
    let count = 0; let totalARS = 0; let totalUSD = 0;
    parsedStatementItems.forEach(item => { 
        if (item.selected) { 
            count++; 
            const signedMonto = item.esCredito ? -item.monto : item.monto;
            if (item.moneda === 'USD') totalUSD += signedMonto; 
            else totalARS += signedMonto; 
        } 
    });
    const lbl = document.getElementById('import-totals-label');
    if (lbl) lbl.innerText = `${count} seleccionados | $${Math.round(totalARS).toLocaleString('es-AR')} ARS | u$d ${totalUSD.toFixed(2)} USD`;
}

function renderStagingTable() {
    const tbody = document.getElementById('import-staging-tbody');
    if (!tbody) return;
    tbody.innerHTML = "";
    if (parsedStatementItems.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:var(--text-muted);">No hay consumos en la lista.</td></tr>`; 
        updateStagingTotals(); 
        return; 
    }

    parsedStatementItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = `staging-row ${item.isDuplicate ? 'is-duplicate' : ''}`;
        const sym = item.moneda === 'USD' ? 'u$d' : '$';
        const sign = item.esCredito ? '-' : '';
        const formattedMonto = `${sign}${sym} ${item.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
        
        let tags = '';
        if (item.isDuplicate) tags += `<span style="font-size:9.5px; font-weight:700; color:var(--warning); margin-left:6px;"><i class="fa-solid fa-triangle-exclamation"></i> Registrado</span>`;
        if (item.esCredito) tags += `<span style="font-size:9.5px; font-weight:700; color:var(--primary); margin-left:6px;">[Reintegro]</span>`;
        if (item.esPendiente) tags += `<span style="font-size:9.5px; font-weight:700; color:var(--text-muted); margin-left:6px;">[Pendiente]</span>`;

        let catOptions = state.misCategoriasUnificadas.map(c => `<option value="${c}" ${c === item.categoria ? 'selected' : ''}>${c}</option>`).join('');

        tr.innerHTML = `
            <td style="text-align:center; vertical-align:middle;">
                <input type="checkbox" class="staging-item-checkbox" data-index="${index}" ${item.selected ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color:var(--primary);">
            </td>
            <td style="white-space:nowrap; font-size:12px; vertical-align:middle;">${item.fecha}</td>
            <td style="white-space:nowrap; font-weight:700; color:${item.esCredito ? 'var(--primary)' : (item.moneda === 'USD' ? 'var(--primary)' : '#fff')}; font-size:13px; vertical-align:middle;">${formattedMonto}</td>
            <td style="vertical-align:middle;"><div style="font-weight:500; font-size:12.5px;">${item.descripcion} ${tags}</div></td>
            <td style="vertical-align:middle;"><select class="staging-category-select" data-index="${index}">${catOptions}</select></td>
            <td style="text-align:center; vertical-align:middle;"><button type="button" class="btn-staging-remove" data-index="${index}" title="Quitar consumo de la lista"><i class="fa-solid fa-xmark"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.staging-item-checkbox').forEach(chk => { 
        chk.addEventListener('change', (e) => { 
            const idx = parseInt(e.target.getAttribute('data-index'), 10); 
            parsedStatementItems[idx].selected = e.target.checked; 
            updateStagingTotals(); 
        }); 
    });

    tbody.querySelectorAll('.staging-category-select').forEach(sel => { 
        sel.addEventListener('change', (e) => { 
            const idx = parseInt(e.target.getAttribute('data-index'), 10); 
            parsedStatementItems[idx].categoria = e.target.value; 
        }); 
    });

    tbody.querySelectorAll('.btn-staging-remove').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            const targetBtn = e.target.closest('.btn-staging-remove'); 
            const idx = parseInt(targetBtn.getAttribute('data-index'), 10); 
            parsedStatementItems.splice(idx, 1); 
            renderStagingTable(); 
        }); 
    });

    updateStagingTotals();
}

function processStatementFile(file) {
    const targetCard = document.getElementById('import-target-card').value;
    const targetPeriod = document.getElementById('import-target-period') ? document.getElementById('import-target-period').value : document.getElementById('global-month-selector').value;

    if (!targetCard) { 
        window.UI.showAppAlert("Atención", "Seleccioná primero la tarjeta de crédito."); 
        return; 
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            parsedStatementItems = await parseVisaStatement(e.target.result, targetCard, state.misCategoriasUnificadas, targetPeriod);
            document.getElementById('import-step-upload').style.display = 'none';
            document.getElementById('import-step-review').style.display = 'flex';
            renderStagingTable();
        } catch (err) { 
            window.UI.showAppAlert("Error de Lectura", err.message); 
        }
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then((reg) => reg.update());
    initMonthSelector(); fetchMarketData();
    window.addEventListener('market-fx-updated', () => { if (state.currentUser) recalculateFinancialMetrics(); });
    
    _supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            state.currentUser = session.user; document.getElementById('login-screen').style.display = 'none'; document.getElementById('dashboard-screen').style.display = 'block';
            loadUserDataFromDatabase(); syncOfflineQueue(() => window.UI.showToast("Operaciones offline sincronizadas"));
        }
    });

    document.getElementById('form-auth-login')?.addEventListener('submit', async (e) => {
        e.preventDefault(); const btn = document.getElementById('btn-login-submit'); btn.disabled = true; btn.innerText = "Ingresando...";
        const { data, error } = await _supabase.auth.signInWithPassword({ email: document.getElementById('email').value.trim(), password: document.getElementById('password').value });
        btn.disabled = false; btn.innerText = "Iniciar Sesión";
        if (error) window.UI.showAppAlert("Fallo", error.message); else { state.currentUser = data.user; document.getElementById('login-screen').style.display = 'none'; document.getElementById('dashboard-screen').style.display = 'block'; loadUserDataFromDatabase(); }
    });
    
    document.getElementById('btn-header-logout')?.addEventListener('click', () => window.UI.showAppConfirm("Salir", "¿Querés cerrar sesión?", async () => { await _supabase.auth.signOut(); window.location.reload(); }));
    document.getElementById('global-month-selector')?.addEventListener('change', loadUserDataFromDatabase);
    document.getElementById('btn-header-bell')?.addEventListener('click', () => window.UI.openModal('notifications-modal-center'));
    document.getElementById('btn-nav-inicio')?.addEventListener('click', () => switchView('view-inicio', 'btn-nav-inicio'));
    document.getElementById('btn-nav-inversiones')?.addEventListener('click', () => switchView('view-inversiones', 'btn-nav-inversiones'));
    document.getElementById('btn-nav-rapido')?.addEventListener('click', () => switchView('view-rapido', 'btn-nav-rapido'));
    document.getElementById('btn-nav-mas')?.addEventListener('click', () => switchView('view-mas', 'btn-nav-mas'));
    document.getElementById('btn-nav-config')?.addEventListener('click', () => switchView('view-config', 'btn-nav-config'));
    document.getElementById('subtab-btn-presupuestos')?.addEventListener('click', () => switchSubTab('subview-presupuestos', 'subtab-btn-presupuestos'));
    document.getElementById('subtab-btn-historial')?.addEventListener('click', () => switchSubTab('subview-historial', 'subtab-btn-historial'));
    document.getElementById('subtab-btn-graficos')?.addEventListener('click', () => switchSubTab('subview-graficos', 'subtab-btn-graficos'));
    document.getElementById('btn-chart-scale-toggle')?.addEventListener('click', toggleInteractiveScale);
    document.getElementById('btn-chart-zoom-reset')?.addEventListener('click', resetInteractiveZoom);
    document.getElementById('btn-history-zoom-reset')?.addEventListener('click', resetInteractiveHistoryZoom);
    document.getElementById('btn-chart-zoom-in-x')?.addEventListener('click', () => zoomPerformanceChart('x', 0.8));
    document.getElementById('btn-chart-zoom-out-x')?.addEventListener('click', () => zoomPerformanceChart('x', 1.25));
    document.getElementById('btn-chart-zoom-in-y')?.addEventListener('click', () => zoomPerformanceChart('y', 0.8));
    document.getElementById('btn-chart-zoom-out-y')?.addEventListener('click', () => zoomPerformanceChart('y', 1.25));
    document.getElementById('btn-history-zoom-in')?.addEventListener('click', () => zoomHistoryChart(0.8));
    document.getElementById('btn-history-zoom-out')?.addEventListener('click', () => zoomHistoryChart(1.25));

    document.getElementById('btn-trigger-report')?.addEventListener('click', () => {
        const audit = executeFinancialAuditEngine(); 
        const body = document.getElementById('audit-modal-body');
        if (body) body.innerHTML = `<div style="background:var(--bg-input); padding:16px; border-radius:10px; margin-bottom:12px; border-left:4px solid ${audit.ratingColor};"><div style="font-weight:700; font-size:15px; color:#fff;">Score Contable: ${audit.score}/100</div><div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Dictamen: <strong>${audit.ratingText}</strong></div></div><ul style="font-size:12px; color:var(--text-muted); line-height:1.6; padding-left:18px;"><li>${audit.transferenciasHuerfanas.length === 0 ? "✓ Partida doble cuadrada" : `⚠ ${audit.transferenciasHuerfanas.length} transferencias desalineadas`}</li><li>${audit.cuentasEnRojo.length === 0 ? "✓ Cajas operativas en positivo" : `⚠ Cuentas en saldo negativo: ${audit.cuentasEnRojo.join(', ')}`}</li><li>${audit.tarjetasConDeuda.length === 0 ? "✓ Tarjetas al día" : `💳 Deuda en tarjetas: ${audit.tarjetasConDeuda.join(', ')}`}</li><li>${audit.posiblesDuplicados.length === 0 ? "✓ Sin consumos duplicados" : `⚠ ${audit.posiblesDuplicados.length} posibles consumos repetidos`}</li></ul>`;
        window.UI.openModal('audit-preflight-modal');
    });
    document.getElementById('btn-confirm-export-pdf')?.addEventListener('click', () => { window.UI.closeModal('audit-preflight-modal'); exportAuditPDF(state.cachedAuditResult); });

    const updateUnifiedFormUI = () => {
        const uniTipo = document.getElementById('uni-tipo');
        const uniOrigen = document.getElementById('uni-origen');
        const t = uniTipo ? uniTipo.value : 'GASTO';
        const origenVal = uniOrigen ? uniOrigen.value : '';
        const esTarjeta = CUENTAS_TARJETAS.includes(origenVal);

        const boxDestino = document.getElementById('box-uni-destino');
        const boxCat = document.getElementById('box-uni-categoria');
        const boxPureza = document.getElementById('box-uni-pureza');
        const boxExcluir = document.getElementById('box-uni-excluir');
        const boxMontoDestino = document.getElementById('box-uni-monto-destino');
        const lblOrigen = document.getElementById('lbl-uni-origen');

        if (boxDestino) boxDestino.style.display = (t === 'TRANSFERENCIA' || t === 'CAMBIO_DIVISAS' || t === 'RENDIMIENTO') ? 'block' : 'none';
        if (boxCat) boxCat.style.display = (t === 'GASTO') ? 'block' : 'none';
        if (boxPureza) boxPureza.style.display = (t === 'RENDIMIENTO') ? 'block' : 'none';
        if (boxExcluir) boxExcluir.style.display = (t === 'GASTO' && !esTarjeta) ? 'block' : 'none';
        if (boxMontoDestino) boxMontoDestino.style.display = (t === 'CAMBIO_DIVISAS') ? 'block' : 'none';
        
        if (lblOrigen) {
            const labelText = (t === 'INGRESO') ? 'Cuenta Receptora' : 'Cuenta Débito / Origen';
            if (lblOrigen.tagName === 'LABEL') {
                lblOrigen.innerText = labelText;
            } else {
                const innerLabel = lblOrigen.querySelector('label');
                if (innerLabel) innerLabel.innerText = labelText;
            }
        }
    };
    window.updateUnifiedFormUI = updateUnifiedFormUI;
    document.getElementById('uni-origen')?.addEventListener('change', updateUnifiedFormUI);

    const hoyIso = getLocalDateString();
    if (document.getElementById('uni-fecha')) document.getElementById('uni-fecha').value = hoyIso;
    if (document.getElementById('audit-fecha')) document.getElementById('audit-fecha').value = hoyIso;
    if (document.getElementById('close-card-fecha')) document.getElementById('close-card-fecha').value = hoyIso;

    // REGISTRO DE MOVIMIENTOS
    document.getElementById('unified-engine-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-unified-submit');
        
        try {
            if (!state.currentUser) {
                const { data: { session } } = await _supabase.auth.getSession();
                if (session?.user) {
                    state.currentUser = session.user;
                } else {
                    window.UI.showAppAlert("Sesión Expirada", "Por favor, cerrá sesión y volvé a ingresar.");
                    return;
                }
            }

            const elTipo = document.getElementById('uni-tipo');
            const elFecha = document.getElementById('uni-fecha');
            const elMonto = document.getElementById('uni-monto');
            const elConcepto = document.getElementById('uni-concepto');
            const elOrigen = document.getElementById('uni-origen');
            const elDestino = document.getElementById('uni-destino');
            const elCat = document.getElementById('uni-categoria');
            const elMoneda = document.getElementById('uni-moneda');
            const elPureza = document.getElementById('uni-pureza');
            const elExcluir = document.getElementById('uni-excluir');
            const elMontoDestino = document.getElementById('uni-monto-destino');

            if (!elOrigen || !elOrigen.value) {
                window.UI.showAppAlert("Atención", "Por favor, seleccioná una cuenta de origen.");
                return;
            }

            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Procesando...`;
            }

            const rawBatch = buildUnifiedTransactionBatch({
                type: elTipo ? elTipo.value : 'GASTO',
                fecha: elFecha ? elFecha.value : getLocalDateString(),
                monto: parseFloat(elMonto ? elMonto.value : 0),
                concepto: elConcepto ? elConcepto.value.trim() : '',
                origen: elOrigen.value,
                destino: elDestino ? elDestino.value : '',
                categoria: elCat ? elCat.value : '',
                moneda: elMoneda ? elMoneda.value : 'ARS',
                pureza: elPureza ? elPureza.value : 'REINVERSION',
                excluirGasto: elExcluir ? elExcluir.checked : false,
                montoDestino: parseFloat(elMontoDestino ? elMontoDestino.value : 0) || 0
            });

            const batch = (Array.isArray(rawBatch) ? rawBatch : [rawBatch]).map(item => ({
                ...item,
                user_id: item.user_id || state.currentUser.id,
                autor: item.autor || state.currentUser.email
            }));

            if (!navigator.onLine) {
                saveOfflineQueue(batch);
                window.UI.showToast("Operación encolada offline");
                if (elMonto) { elMonto.value = ""; elMonto.focus(); }
                if (elConcepto) elConcepto.value = "";
                return;
            }

            const { error } = await _supabase.from('transacciones').insert(batch);

            if (error) {
                window.UI.showAppAlert("Error al Guardar", error.message);
            } else {
                window.UI.showToast("Movimiento registrado con éxito");
                if (elMonto) { elMonto.value = ""; elMonto.focus(); }
                if (elConcepto) elConcepto.value = "";
                if (elMontoDestino) elMontoDestino.value = "";
                loadUserDataFromDatabase();
            }
        } catch (err) {
            console.error("Error en procesamiento de movimiento:", err);
            window.UI.showAppAlert("Error Inesperado", "Ocurrió un error al procesar el movimiento: " + err.message);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<i class="fa-solid fa-check"></i> Procesar Movimiento`;
            }
        }
    });

    // GUARDAR PRESUPUESTO
    document.getElementById('form-save-budget')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selector = document.getElementById('global-month-selector');
        const periodo = selector ? selector.value : getLocalDateString().substring(0, 7);
        const cat = document.getElementById('pre-cat').value;
        const monto = parseFloat(document.getElementById('pre-mon').value);
        const vencimiento = document.getElementById('pre-fecha').value || null;

        try {
            const { data: existing, error: selErr } = await _supabase.from('categorias')
                .select('id')
                .eq('user_id', state.currentUser.id)
                .eq('nombre', cat)
                .eq('periodo', periodo)
                .maybeSingle();

            if (selErr) throw selErr;

            if (existing) {
                const { error: updErr } = await _supabase.from('categorias')
                    .update({ presupuesto_mensual: monto, fecha_vencimiento: vencimiento })
                    .eq('id', existing.id);
                if (updErr) throw updErr;
            } else {
                const { error: insErr } = await _supabase.from('categorias')
                    .insert([{
                        user_id: state.currentUser.id,
                        nombre: cat,
                        presupuesto_mensual: monto,
                        periodo,
                        fecha_vencimiento: vencimiento
                    }]);
                if (insErr) throw insErr;
            }

            window.UI.showToast("Planificación guardada");
            document.getElementById('pre-mon').value = "";
            document.getElementById('pre-fecha').value = "";
            loadUserDataFromDatabase();
        } catch (err) {
            window.UI.showAppAlert("Error al Guardar Presupuesto", err.message);
        }
    });

    // MODAL EDITAR PRESUPUESTO
    document.getElementById('form-modal-edit-budget')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selector = document.getElementById('global-month-selector');
        const periodo = selector ? selector.value : getLocalDateString().substring(0, 7);
        const catName = document.getElementById('edit-budget-cat-name').value;
        const num = parseFloat(document.getElementById('edit-budget-amount').value);

        if (isNaN(num) || num < 0) {
            window.UI.showAppAlert("Entrada inválida", "Ingresá un monto numérico positivo.");
            return;
        }

        try {
            const { data: existing, error: selErr } = await _supabase.from('categorias')
                .select('id')
                .eq('user_id', state.currentUser.id)
                .eq('nombre', catName)
                .eq('periodo', periodo)
                .maybeSingle();

            if (selErr) throw selErr;

            if (existing) {
                const { error: updErr } = await _supabase.from('categorias')
                    .update({ presupuesto_mensual: num })
                    .eq('id', existing.id);
                if (updErr) throw updErr;
            } else {
                const { error: insErr } = await _supabase.from('categorias')
                    .insert([{
                        user_id: state.currentUser.id,
                        nombre: catName,
                        presupuesto_mensual: num,
                        periodo
                    }]);
                if (insErr) throw insErr;
            }

            window.UI.closeModal('modal-edit-budget');
            window.UI.showToast(`Presupuesto de "${catName}" actualizado`);
            loadUserDataFromDatabase();
        } catch (err) {
            window.UI.showAppAlert("Error", err.message);
        }
    });

    // LIQUIDACIÓN DE TARJETA CON BLINDAJE DE EXCEPCIONES
    document.getElementById('form-card-closing')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnClosing = document.getElementById('btn-card-closing-submit');
        const tarjeta = document.getElementById('close-card-select').value;
        const fecha = document.getElementById('close-card-fecha').value;
        const sellos = parseFloat(document.getElementById('close-card-sellos').value) || 0;
        const intereses = parseFloat(document.getElementById('close-card-intereses').value) || 0;
        const otros = parseFloat(document.getElementById('close-card-otros').value) || 0;
        const moneda = document.getElementById('close-card-moneda').value;

        if (sellos === 0 && intereses === 0 && otros === 0) {
            window.UI.showAppAlert("Atención", "Ingresá al menos un cargo en impuestos, intereses o renovación.");
            return;
        }

        const mesPeriodo = fecha.substring(0, 7);
        const existingClosing = state.globalTransData.filter(t => 
            t.cuenta === tarjeta && 
            t.fecha && t.fecha.substring(0, 7) === mesPeriodo &&
            (t.categoria === 'Impuestos y Sellos' || t.categoria === 'Intereses Financieros' || (t.descripcion || '').toLowerCase().includes('resumen'))
        );

        const executeClosingInsert = async () => {
            if (btnClosing) {
                btnClosing.disabled = true;
                btnClosing.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Liquidando...`;
            }

            try {
                const batch = buildCreditCardClosingBatch({
                    tarjeta,
                    fecha,
                    impuestosSellos: sellos,
                    intereses,
                    otrosCargos: otros,
                    moneda
                }).map(item => ({
                    ...item,
                    user_id: state.currentUser.id,
                    autor: state.currentUser.email
                }));

                const { error } = await _supabase.from('transacciones').insert(batch);
                if (error) throw error;

                window.UI.closeModal('modal-card-closing');
                window.UI.showToast(`Resumen liquidado en ${tarjeta} (+${batch.length} cargos)`);
                document.getElementById('close-card-sellos').value = "";
                document.getElementById('close-card-intereses').value = "";
                document.getElementById('close-card-otros').value = "";
                await loadUserDataFromDatabase();
            } catch (err) {
                console.error("Error al liquidar resumen:", err);
                window.UI.showAppAlert("Error al Liquidar", err.message);
            } finally {
                if (btnClosing) {
                    btnClosing.disabled = false;
                    btnClosing.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> Imputar Cargos`;
                }
            }
        };

        if (existingClosing.length > 0) {
            window.UI.showAppConfirm(
                "Posible Duplicado de Liquidación",
                `Ya se encontraron ${existingClosing.length} cargos de liquidación previos para ${tarjeta} en ${mesPeriodo}. ¿Estás seguro de que deseas imputarlos nuevamente?`,
                executeClosingInsert
            );
        } else {
            await executeClosingInsert();
        }
    });

    // DUPLICAR MES ANTERIOR
    document.getElementById('btn-clone-budget')?.addEventListener('click', async () => {
        const currentPeriodo = document.getElementById('global-month-selector') ? document.getElementById('global-month-selector').value : getLocalDateString().substring(0, 7);
        const prevPeriodo = getPreviousMonthStr(currentPeriodo);
        
        window.UI.showAppConfirm("Copiar Presupuesto", `¿Deseas duplicar la asignación de ${prevPeriodo} en ${currentPeriodo}?`, async () => {
            const btn = document.getElementById('btn-clone-budget');
            if (btn) btn.disabled = true;

            try {
                const { data: prevBudgets, error: prevErr } = await _supabase.from('categorias')
                    .select('*')
                    .eq('user_id', state.currentUser.id)
                    .eq('periodo', prevPeriodo);

                if (prevErr) throw prevErr;
                if (!prevBudgets || prevBudgets.length === 0) {
                    window.UI.showAppAlert("Sin Registros", `No hay presupuestos previos registrados en ${prevPeriodo} para duplicar.`);
                    return;
                }

                const { data: existingTarget, error: exErr } = await _supabase.from('categorias')
                    .select('id, nombre')
                    .eq('user_id', state.currentUser.id)
                    .eq('periodo', currentPeriodo);

                if (exErr) throw exErr;

                const existingMap = new Map((existingTarget || []).map(item => [item.nombre, item.id]));
                const updatePromises = [];
                const insertBatch = [];

                prevBudgets.forEach(b => {
                    const targetId = existingMap.get(b.nombre);
                    if (targetId) {
                        updatePromises.push(
                            _supabase.from('categorias')
                                .update({
                                    presupuesto_mensual: b.presupuesto_mensual,
                                    fecha_vencimiento: null
                                })
                                .eq('id', targetId)
                        );
                    } else {
                        insertBatch.push({
                            user_id: state.currentUser.id,
                            nombre: b.nombre,
                            presupuesto_mensual: b.presupuesto_mensual,
                            periodo: currentPeriodo,
                            fecha_vencimiento: null
                        });
                    }
                });

                if (insertBatch.length > 0) {
                    const { error: insError } = await _supabase.from('categorias').insert(insertBatch);
                    if (insError) throw insError;
                }

                if (updatePromises.length > 0) {
                    await Promise.all(updatePromises);
                }

                window.UI.showToast(`Presupuesto de ${prevPeriodo} duplicado a ${currentPeriodo}`);
                await loadUserDataFromDatabase();
            } catch (err) {
                console.error("Error al duplicar presupuestos:", err);
                window.UI.showAppAlert("Error", "No se pudo duplicar el presupuesto: " + err.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    });

    // GUARDAR EDICIÓN CON CONTROL ESTRICTO DE SIGNO EN CONTRA-GASTOS / REINTEGROS
    document.getElementById('modal-edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        if (!state.editingTransactionId) return;
        
        const btnSubmit = document.getElementById('btn-edit-transaction-submit');
        const t = state.globalTransData.find(item => item.id === state.editingTransactionId); 
        if (!t) return;

        let numMonto = parseFloat(document.getElementById('edit-form-importe').value) || 0;
        const esCredito = (document.getElementById('edit-form-es-credito')?.value === 'true');
        
        // Preserva el signo negativo si correspondía a un reintegro o nota de crédito
        if (esCredito) {
            numMonto = -Math.abs(numMonto);
        } else {
            numMonto = Math.abs(numMonto);
        }

        const payload = { 
            fecha: document.getElementById('edit-form-fecha').value, 
            monto: numMonto, 
            descripcion: document.getElementById('edit-form-concepto').value.trim(), 
            cuenta: document.getElementById('edit-form-metodo').value, 
            categoria: document.getElementById('edit-form-categoria').value, 
            presupuestado: document.getElementById('edit-form-presupuestado').value || 'SI', 
            moneda: document.getElementById('edit-form-moneda').value 
        };

        const isGroup = !!t.transfer_group_id;
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
        }

        try {
            const updates = [_supabase.from('transacciones').update(payload).eq('id', state.editingTransactionId)];

            if (isGroup) { 
                const peer = state.globalTransData.find(item => item.transfer_group_id === t.transfer_group_id && item.id !== t.id); 
                if (peer) { 
                    const peerPayload = { fecha: payload.fecha }; 
                    if (t.categoria !== 'Compra/Venta Divisas') { 
                        peerPayload.monto = Math.abs(payload.monto); 
                        peerPayload.moneda = payload.moneda; 
                    } 
                    updates.push(_supabase.from('transacciones').update(peerPayload).eq('id', peer.id)); 
                } 
            }

            const results = await Promise.all(updates);
            const err = results.find(r => r.error);

            if (err) throw err.error;
            
            window.UI.closeModal('edit-transaction-modal'); 
            window.UI.showToast(isGroup ? "Partida doble sincronizada con éxito" : "Registro actualizado correctamente"); 
            await loadUserDataFromDatabase();
        } catch (err) {
            console.error("Error al actualizar movimiento:", err);
            window.UI.showAppAlert("Error al Guardar", err.message);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar Cambios`;
            }
        }
    });

    // AJUSTE TÉCNICO DE SALDOS
    document.getElementById('form-audit-adjust')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-audit-adjust-submit');
        const numMonto = parseFloat(document.getElementById('audit-monto').value);

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Aplicando...`;
        }

        try {
            const payload = { 
                user_id: state.currentUser.id, 
                tipo: document.getElementById('audit-tipo').value === 'AJUSTE_POSITIVO' ? 'ingreso' : 'gasto', 
                monto: Math.abs(numMonto), 
                fecha: document.getElementById('audit-fecha').value, 
                categoria: 'Ajuste Técnico Saldos', 
                cuenta: document.getElementById('audit-cuenta').value, 
                descripcion: `Reconciliación: ${document.getElementById('audit-concepto').value.trim()}`, 
                presupuestado: 'NO_COMPUTA', 
                moneda: document.getElementById('audit-moneda').value, 
                tipo_cambio: (document.getElementById('audit-moneda').value === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                autor: state.currentUser.email 
            };

            const { error } = await _supabase.from('transacciones').insert([payload]);
            if (error) throw error;

            window.UI.showToast("Ajuste aplicado correctamente"); 
            document.getElementById('audit-monto').value = ""; 
            document.getElementById('audit-concepto').value = ""; 
            await loadUserDataFromDatabase();
        } catch (err) {
            console.error("Error en ajuste técnico:", err);
            window.UI.showAppAlert("Error en Ajuste", err.message);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `Aplicar Ajuste Contable`;
            }
        }
    });

    // CREACIÓN DE CATEGORÍA
    document.getElementById('form-new-category')?.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const btnSubmit = document.getElementById('btn-new-cat-submit');
        const catName = document.getElementById('new-cat-name').value.trim(); 
        if (!catName) return;

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creando...`;
        }

        try {
            const { error } = await _supabase.from('user_categories').insert([{ user_id: state.currentUser.id, nombre_categoria: catName }]);
            if (error) throw error;

            window.UI.showToast(`Categoría "${catName}" añadida`); 
            document.getElementById('new-cat-name').value = ""; 
            await loadUserDataFromDatabase();
        } catch (err) {
            console.error("Error al crear categoría:", err);
            window.UI.showAppAlert("Error", err.message);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<i class="fa-solid fa-plus"></i> Crear Categoría`;
            }
        }
    });

    document.getElementById('btn-open-statement-importer')?.addEventListener('click', () => {
        document.getElementById('import-step-upload').style.display = 'block'; 
        document.getElementById('import-step-review').style.display = 'none'; 
        document.getElementById('import-file-input').value = ""; 
        parsedStatementItems = []; 
        
        const currentSelectedMonth = document.getElementById('global-month-selector') ? document.getElementById('global-month-selector').value : '';
        const importMonthEl = document.getElementById('import-target-period');
        if (importMonthEl && currentSelectedMonth) {
            importMonthEl.value = currentSelectedMonth;
        }

        window.UI.openModal('modal-import-statement');
    });

    document.getElementById('import-dropzone')?.addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input')?.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) processStatementFile(e.target.files[0]); });
    document.getElementById('import-check-all')?.addEventListener('change', (e) => { parsedStatementItems.forEach(item => item.selected = e.target.checked); renderStagingTable(); });
    document.getElementById('btn-import-reset')?.addEventListener('click', () => { 
        document.getElementById('import-step-upload').style.display = 'block'; 
        document.getElementById('import-step-review').style.display = 'none'; 
        document.getElementById('import-file-input').value = ""; 
        parsedStatementItems = []; 
    });

    // INYECCIÓN DE CONSUMOS BANCARIOS CON PURGA DE MEMORIA
    document.getElementById('btn-confirm-import')?.addEventListener('click', async () => {
        const targetCard = document.getElementById('import-target-card').value; 
        const seleccionados = parsedStatementItems.filter(item => item.selected);

        if (seleccionados.length === 0) { 
            window.UI.showAppAlert("Atención", "No has seleccionado ningún consumo."); 
            return; 
        }

        const btn = document.getElementById('btn-confirm-import'); 
        btn.disabled = true; 
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Inyectando...`;

        try {
            const batch = seleccionados.map(item => ({ 
                user_id: state.currentUser.id, 
                fecha: item.fecha, 
                monto: item.esCredito ? -Math.abs(item.monto) : Math.abs(item.monto), 
                descripcion: item.descripcion, 
                cuenta: targetCard, 
                categoria: item.categoria, 
                tipo: 'gasto', 
                presupuestado: 'SI', 
                moneda: item.moneda, 
                tipo_cambio: item.tipo_cambio || (item.moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : 1),
                autor: state.currentUser.email 
            }));

            const { error } = await _supabase.from('transacciones').insert(batch);
            if (error) throw error;

            // Purga de estado en memoria para evitar colisiones
            parsedStatementItems = [];
            const fileInput = document.getElementById('import-file-input');
            if (fileInput) fileInput.value = "";

            window.UI.closeModal('modal-import-statement'); 
            window.UI.showToast(`Se inyectaron ${batch.length} consumos a ${targetCard}`); 
            await loadUserDataFromDatabase();
        } catch (err) {
            console.error("Error al inyectar consumos:", err);
            window.UI.showAppAlert("Error", err.message);
        } finally {
            btn.disabled = false; 
            btn.innerHTML = `<i class="fa-solid fa-check-double"></i> Inyectar al Historial`;
        }
    });

    document.getElementById('filter-search')?.addEventListener('input', applyFilters); 
    document.getElementById('filter-tipo')?.addEventListener('change', applyFilters); 
    document.getElementById('filter-cuenta')?.addEventListener('change', applyFilters); 
    document.getElementById('filter-categoria')?.addEventListener('change', applyFilters); 
    document.getElementById('filter-autor')?.addEventListener('change', applyFilters);
});
