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

// EXPOSICIÓN GLOBAL DE UTILIDADES DE INTERFAZ (UI)
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

        if (typeof window.updateUnifiedFormUI === 'function') {
            window.updateUnifiedFormUI();
        }
    }
};

// GESTIÓN DE VISTAS Y NAVEGACIÓN
function switchView(targetViewId, targetTabBtnId) {
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.mobile-tab-bar .tab-item').forEach(b => b.classList.remove('active'));

    const view = document.getElementById(targetViewId);
    const tabBtn = document.getElementById(targetTabBtnId);
    if (view) view.classList.add('active');
    if (tabBtn) tabBtn.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchSubTab(targetSubViewId, targetSubBtnId) {
    document.querySelectorAll('.subview-content').forEach(sv => sv.classList.remove('active'));
    document.querySelectorAll('.subtabs-nav .subtab-link').forEach(btn => btn.classList.remove('active'));

    const subView = document.getElementById(targetSubViewId);
    const btn = document.getElementById(targetSubBtnId);
    if (subView) subView.classList.add('active');
    if (btn) btn.classList.add('active');

    if (targetSubViewId === 'subview-graficos') {
        renderInteractiveChart(state.cachedCategoriesDataForChart);
        renderInteractiveHistoryChart(state.cachedHistoricalDataForChart);
    }
}

// INICIALIZACIÓN DE SELECTORES
function initMonthSelector() {
    const selector = document.getElementById('global-month-selector');
    if (!selector) return;
    selector.innerHTML = "";

    const fechaBase = new Date(2026, 6, 1);
    const fechaActual = new Date();
    let currentIter = new Date(fechaBase);

    let opciones = [];
    while (currentIter <= fechaActual || (currentIter.getFullYear() === fechaActual.getFullYear() && currentIter.getMonth() <= fechaActual.getMonth() + 1)) {
        const y = currentIter.getFullYear();
        const m = String(currentIter.getMonth() + 1).padStart(2, '0');
        const val = `${y}-${m}`;
        const label = `${MESES_ES[currentIter.getMonth()]} ${y}`;
        opciones.unshift({ val, label });
        currentIter.setMonth(currentIter.getMonth() + 1);
    }

    opciones.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.val;
        o.innerText = opt.label;
        selector.appendChild(o);
    });

    const mesActualStr = getLocalDateString().substring(0, 7);
    if (Array.from(selector.options).some(o => o.value === mesActualStr)) {
        selector.value = mesActualStr;
    }
}

function populateSelectOptions() {
    const fillSelect = (id, options, keepFirst = false) => {
        const el = document.getElementById(id);
        if (!el) return;
        const firstOpt = keepFirst ? el.options[0] : null;
        el.innerHTML = "";
        if (firstOpt) el.appendChild(firstOpt);
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.innerText = opt;
            el.appendChild(o);
        });
    };

    fillSelect('uni-origen', CUENTAS_SISTEMA_TOTAL);
    fillSelect('uni-destino', CUENTAS_SISTEMA_TOTAL);
    fillSelect('uni-categoria', state.misCategoriasUnificadas);
    fillSelect('pre-cat', state.misCategoriasUnificadas);
    fillSelect('audit-cuenta', CUENTAS_OPERATIVAS);
    fillSelect('edit-form-metodo', CUENTAS_SISTEMA_TOTAL);
    fillSelect('edit-form-categoria', state.misCategoriasUnificadas);

    fillSelect('filter-cuenta', CUENTAS_SISTEMA_TOTAL, true);
    fillSelect('filter-categoria', state.misCategoriasUnificadas, true);
}

// CÁLCULO DE SALDOS, PASIVOS Y PATRIMONIO NETO
function recalculateFinancialMetrics() {
    const selector = document.getElementById('global-month-selector');
    const activeMonth = selector ? selector.value : getLocalDateString().substring(0, 7);

    state.currentAccountBalancesARS = {};
    state.currentAccountBalancesUSD = {};
    state.brokerEarningsARS = {};
    state.brokerEarningsUSD = {};
    state.creditCardDebtARS = {};
    state.creditCardDebtUSD = {};

    CUENTAS_SISTEMA_TOTAL.forEach(acc => {
        state.currentAccountBalancesARS[acc] = 0;
        state.currentAccountBalancesUSD[acc] = 0;
    });
    CUENTAS_COMITENTES.forEach(b => {
        state.brokerEarningsARS[b] = 0;
        state.brokerEarningsUSD[b] = 0;
    });
    CUENTAS_TARJETAS.forEach(c => {
        state.creditCardDebtARS[c] = 0;
        state.creditCardDebtUSD[c] = 0;
    });

    let totalIngresosMes = 0;
    let totalGastosMes = 0;
    let totalPlanificadoMes = 0;

    let catGastosMap = {};
    state.misCategoriasUnificadas.forEach(c => { catGastosMap[c] = 0; });

    state.globalTransData.forEach(t => {
        const monto = parseFloat(t.monto) || 0;
        const isCurrentMonth = t.fecha && t.fecha.substring(0, 7) === activeMonth;
        const convUSD = (t.moneda === 'USD') ? monto * (t.tipo_cambio || TIPO_CAMBIO_PRESUPUESTO) : monto;
        const esTarjeta = CUENTAS_TARJETAS.includes(t.cuenta);

        if (esTarjeta) {
            if (t.moneda === 'USD') {
                if (t.tipo === 'gasto') state.creditCardDebtUSD[t.cuenta] = (state.creditCardDebtUSD[t.cuenta] || 0) + monto;
                else if (t.tipo === 'ingreso') state.creditCardDebtUSD[t.cuenta] = (state.creditCardDebtUSD[t.cuenta] || 0) - monto;
            } else {
                if (t.tipo === 'gasto') state.creditCardDebtARS[t.cuenta] = (state.creditCardDebtARS[t.cuenta] || 0) + monto;
                else if (t.tipo === 'ingreso') state.creditCardDebtARS[t.cuenta] = (state.creditCardDebtARS[t.cuenta] || 0) - monto;
            }
        } else {
            if (t.moneda === 'USD') {
                if (t.tipo === 'ingreso') state.currentAccountBalancesUSD[t.cuenta] = (state.currentAccountBalancesUSD[t.cuenta] || 0) + monto;
                else if (t.tipo === 'gasto') state.currentAccountBalancesUSD[t.cuenta] = (state.currentAccountBalancesUSD[t.cuenta] || 0) - monto;
            } else {
                if (t.tipo === 'ingreso') state.currentAccountBalancesARS[t.cuenta] = (state.currentAccountBalancesARS[t.cuenta] || 0) + monto;
                else if (t.tipo === 'gasto') state.currentAccountBalancesARS[t.cuenta] = (state.currentAccountBalancesARS[t.cuenta] || 0) - monto;
            }
        }

        if (isCurrentMonth) {
            if (t.categoria === 'Rendimiento Inversiones') {
                if (t.moneda === 'USD') state.brokerEarningsUSD[t.cuenta] = (state.brokerEarningsUSD[t.cuenta] || 0) + monto;
                else state.brokerEarningsARS[t.cuenta] = (state.brokerEarningsARS[t.cuenta] || 0) + monto;
            }

            const esTransferenciaOPago = (t.categoria === 'Transferencia Interna' || t.categoria === 'Compra/Venta Divisas' || t.categoria === 'Pago Tarjeta de Crédito' || t.categoria === 'Ajuste Técnico Saldos');

            if (t.tipo === 'ingreso' && !esTransferenciaOPago) {
                totalIngresosMes += convUSD;
            } else if (t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA' && !esTransferenciaOPago) {
                totalGastosMes += convUSD;
                if (catGastosMap[t.categoria] !== undefined) {
                    catGastosMap[t.categoria] += convUSD;
                }
            }
        }
    });

    let catMetaMap = {};
    state.misCategoriasUnificadas.forEach(c => { catMetaMap[c] = 0; });
    state.globalBudgetData.forEach(b => {
        const val = parseFloat(b.presupuesto_mensual) || 0;
        totalPlanificadoMes += val;
        if (catMetaMap[b.nombre] !== undefined) catMetaMap[b.nombre] = val;
    });

    // CORRECCIÓN CRÍTICA 1: Deduplicación matemática estricta de activos
    // Se itera sobre el conjunto único de cuentas operativas e inversiones para que Mercado Pago no compute doble
    const cuentasActivoUnicas = [...new Set([...CUENTAS_OPERATIVAS, ...CUENTAS_COMITENTES])];
    let totalActivos = 0;
    cuentasActivoUnicas.forEach(acc => {
        totalActivos += (state.currentAccountBalancesARS[acc] || 0) + ((state.currentAccountBalancesUSD[acc] || 0) * TIPO_CAMBIO_PRESUPUESTO);
    });

    let liquidezDisponible = 0;
    CUENTAS_OPERATIVAS.forEach(acc => {
        liquidezDisponible += (state.currentAccountBalancesARS[acc] || 0) + ((state.currentAccountBalancesUSD[acc] || 0) * TIPO_CAMBIO_PRESUPUESTO);
    });

    // CORRECCIÓN CRÍTICA 3: Cómputo algebraico de deuda y saldos a favor
    let deudaTarjetasTotal = 0;
    CUENTAS_TARJETAS.forEach(c => {
        const dARS = state.creditCardDebtARS[c] || 0;
        const dUSD = state.creditCardDebtUSD[c] || 0;
        deudaTarjetasTotal += dARS + (dUSD * TIPO_CAMBIO_PRESUPUESTO);
    });

    // Patrimonio neto = Total Activos - Pasivo Neto (si es saldo a favor en tarjeta, suma al patrimonio)
    let patrimonioNeto = totalActivos - deudaTarjetasTotal;
    let ahorroMes = totalIngresosMes - totalGastosMes;

    const setCard = (id, mainText, subText = '', subColor = '') => {
        const el = document.getElementById(id);
        if (!el) return;
        const colorStyle = subColor ? `style="color: ${subColor} !important;"` : '';
        el.innerHTML = `<span class="main-val">${mainText}</span>${subText ? `<span class="sub-val" ${colorStyle}>${subText}</span>` : ''}`;
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

    setCard('metric-patrimonio', `$${Math.round(patrimonioNeto).toLocaleString('es-AR')}`, subPatrimonio, colorPatrimonio);
    setCard('metric-ingresos', `$${Math.round(totalIngresosMes).toLocaleString('es-AR')}`);
    setCard('metric-presupuesto', `$${Math.round(totalPlanificadoMes).toLocaleString('es-AR')}`);
    setCard('metric-gastos', `$${Math.round(totalGastosMes).toLocaleString('es-AR')}`);
    setCard('metric-ahorro', `$${Math.round(ahorroMes).toLocaleString('es-AR')}`, ahorroMes >= 0 ? 'Superávit' : 'Déficit', ahorroMes >= 0 ? 'var(--primary)' : 'var(--danger)');
    setCard('metric-disponible', `$${Math.round(liquidezDisponible).toLocaleString('es-AR')}`);

    renderPortfolioPieChart(state.currentAccountBalancesARS);
    renderSavingsPatrimonialTab(state.currentAccountBalancesARS, state.currentAccountBalancesUSD, state.brokerEarningsARS, state.brokerEarningsUSD);

    let categoriesMes = [];
    state.misCategoriasUnificadas.forEach(c => {
        if (c === 'Ajuste Técnico Saldos') return;
        let meta = catMetaMap[c] || 0;
        let gasto = catGastosMap[c] || 0;
        if (meta > 0 || gasto > 0) {
            categoriesMes.push({
                nombre: c,
                meta,
                gasto,
                estado: calcularEstadoRAG(meta, gasto)
            });
        }
    });

    renderAccuracyTable(categoriesMes);
    renderInteractiveChart(categoriesMes);
    buildHistoricalChartData();
    checkRemindersAndAlerts();
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
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:600;">${c.nombre}</td>
                <td style="text-align:right;">$${c.meta.toLocaleString('es-AR')}</td>
                <td style="text-align:right; font-weight:700;">$${c.gasto.toLocaleString('es-AR')}</td>
                <td style="text-align:center;"><span style="color:${badgeColor}; font-weight:700;">● ${c.estado}</span></td>
                <td style="text-align:center;">
                    <button class="btn-action" onclick="window.UI.editBudgetDirect('${c.nombre}', ${c.meta})"><i class="fa-solid fa-pen-to-square"></i></button>
                </td>
            </tr>`;
    });
}

function buildHistoricalChartData() {
    const selector = document.getElementById('global-month-selector');
    if (!selector) return;
    const activeMonthFilter = selector.value;
    const options = Array.from(selector.options).filter(opt => opt.value >= '2026-07' && opt.value <= activeMonthFilter);

    let historicalList = [];
    options.forEach(opt => {
        const periodVal = opt.value;
        let metaSum = 0;
        let gastoSum = 0;

        state.allBudgetDataHistorico.filter(b => b.periodo === periodVal).forEach(b => {
            metaSum += parseFloat(b.presupuesto_mensual) || 0;
        });

        state.globalTransData.filter(t => t.fecha && t.fecha.substring(0, 7) === periodVal && t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA' && t.categoria !== 'Transferencia Interna' && t.categoria !== 'Compra/Venta Divisas' && t.categoria !== 'Pago Tarjeta de Crédito' && t.categoria !== 'Ajuste Técnico Saldos').forEach(t => {
            const m = parseFloat(t.monto) || 0;
            gastoSum += (t.moneda === 'USD') ? m * (t.tipo_cambio || TIPO_CAMBIO_PRESUPUESTO) : m;
        });

        historicalList.push({ mes: opt.text, metaTotal: metaSum, gastoTotal: gastoSum });
    });

    renderInteractiveHistoryChart(historicalList);
}

function renderTransactionHistoryTable(dataset) {
    const tbody = document.getElementById('table-body-real-movs');
    if (!tbody) return;
    tbody.innerHTML = "";

    const list = dataset || state.globalTransData;
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No se encontraron movimientos registrados con esos filtros.</td></tr>`;
        return;
    }

    list.slice(0, 150).forEach(t => {
        const isIngreso = t.tipo === 'ingreso';
        const color = isIngreso ? 'var(--primary)' : 'var(--danger)';
        const sign = isIngreso ? '+' : '-';
        const sym = t.moneda === 'USD' ? 'u$d' : '$';
        const author = t.autor ? (t.autor.includes('dante') ? 'Dante' : 'Lore') : 'Dante';

        tbody.innerHTML += `
            <tr>
                <td>${t.fecha}</td>
                <td style="font-weight:500;">${t.descripcion || '-'}</td>
                <td style="color:${color}; font-weight:700;">${sign} ${sym} ${parseFloat(t.monto).toLocaleString('es-AR')}</td>
                <td>${t.cuenta}</td>
                <td><span style="font-size:11px; background:var(--bg-card); padding:3px 8px; border-radius:6px; border:1px solid var(--border-color);">${t.categoria}</span></td>
                <td>${author}</td>
                <td style="text-align:center;">
                    <button class="btn-action" onclick="window.UI.openEditTransactionModal('${t.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-delete" onclick="window.UI.deleteTransaction('${t.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

function checkRemindersAndAlerts() {
    const today = getLocalDateString();
    state.currentMonthAlertsCache = [];

    state.globalBudgetData.forEach(b => {
        if (b.fecha_vencimiento) {
            let status = 'upcoming';
            if (b.fecha_vencimiento < today) status = 'overdue';
            else if (b.fecha_vencimiento === today) status = 'today';

            state.currentMonthAlertsCache.push({
                categoria: b.nombre,
                monto: b.presupuesto_mensual,
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
        if (state.currentMonthAlertsCache.length === 0) {
            listContainer.innerHTML = `<p style="font-size:13px; color:var(--text-muted); text-align:center; padding:20px;">Sin compromisos pendientes para este mes.</p>`;
        } else {
            state.currentMonthAlertsCache.forEach(a => {
                listContainer.innerHTML += `
                    <div class="alert-item-row ${a.status}">
                        <div>
                            <div style="font-weight:700; font-size:13px; color:#fff;">${a.categoria}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Vencimiento: ${a.fechaFormateada}</div>
                        </div>
                        <div style="font-weight:700; color:var(--warning); font-size:14px;">$${Number(a.monto).toLocaleString('es-AR')}</div>
                    </div>`;
            });
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

        if (tRes.error) throw tRes.error;
        if (bMesRes.error) throw bMesRes.error;
        if (bHistRes.error) throw bHistRes.error;

        state.globalTransData = tRes.data || [];
        state.globalBudgetData = bMesRes.data || [];
        state.allBudgetDataHistorico = bHistRes.data || [];

        recalculateFinancialMetrics();
        renderTransactionHistoryTable(state.globalTransData);
    } catch (err) {
        console.error("Error cargando datos de Supabase:", err);
        window.UI.showToast("Error de conexión al cargar datos", true);
    }
}

window.UI.editBudgetDirect = (catName, currentMeta) => {
    const selector = document.getElementById('global-month-selector');
    const periodo = selector ? selector.value : getLocalDateString().substring(0, 7);

    const input = prompt(`Asignar nuevo presupuesto mensual para "${catName}" ($):`, currentMeta);
    if (input === null) return;
    const num = parseFloat(input);
    if (isNaN(num) || num < 0) {
        window.UI.showAppAlert("Entrada inválida", "Ingresá un monto numérico positivo.");
        return;
    }

    _supabase.from('categorias')
        .upsert([{ user_id: state.currentUser.id, nombre: catName, presupuesto_mensual: num, periodo }], { onConflict: 'user_id, nombre, periodo' })
        .then(({ error }) => {
            if (error) throw error;
            window.UI.showToast(`Presupuesto de ${catName} actualizado`);
            loadUserDataFromDatabase();
        })
        .catch(err => window.UI.showAppAlert("Error", err.message));
};

// CORRECCIÓN CRÍTICA 2A: Eliminación protegida por partida doble
window.UI.deleteTransaction = (id) => {
    const t = state.globalTransData.find(item => item.id === id);
    if (!t) return;

    const isGroup = !!t.transfer_group_id;
    const confirmMsg = isGroup 
        ? "Este movimiento forma parte de una transferencia/cancelación doble. Se eliminarán ambas operaciones para mantener la partida doble cuadrada. ¿Deseas continuar?"
        : "¿Estás seguro de que deseas eliminar este movimiento contable?";

    window.UI.showAppConfirm("Eliminar Registro", confirmMsg, async () => {
        let query = _supabase.from('transacciones').delete();
        if (isGroup) {
            query = query.eq('transfer_group_id', t.transfer_group_id);
        } else {
            query = query.eq('id', id);
        }

        const { error } = await query;
        if (error) {
            window.UI.showAppAlert("Error", "No se pudo eliminar el movimiento: " + error.message);
        } else {
            window.UI.showToast(isGroup ? "Transferencia doble eliminada con éxito" : "Movimiento eliminado con éxito");
            loadUserDataFromDatabase();
        }
    });
};

window.UI.openEditTransactionModal = (id) => {
    const t = state.globalTransData.find(item => item.id === id);
    if (!t) return;
    state.editingTransactionId = id;

    document.getElementById('edit-form-fecha').value = t.fecha;
    document.getElementById('edit-form-importe').value = t.monto;
    document.getElementById('edit-form-concepto').value = t.descripcion;
    document.getElementById('edit-form-metodo').value = t.cuenta;
    document.getElementById('edit-form-categoria').value = t.categoria;
    document.getElementById('edit-form-presupuestado').value = t.presupuestado || 'SI';
    document.getElementById('edit-form-moneda').value = t.moneda || 'ARS';

    window.UI.openModal('edit-transaction-modal');
};

document.addEventListener('DOMContentLoaded', () => {
    initMonthSelector();
    fetchMarketData();

    _supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            state.currentUser = session.user;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('dashboard-screen').style.display = 'block';
            loadUserDataFromDatabase();
            syncOfflineQueue(() => window.UI.showToast("Operaciones offline sincronizadas con la nube"));
        }
    });

    document.getElementById('form-auth-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const btn = document.getElementById('btn-login-submit');

        btn.disabled = true;
        btn.innerText = "Ingresando...";

        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        btn.disabled = false;
        btn.innerText = "Iniciar Sesión";

        if (error) {
            window.UI.showAppAlert("Fallo de Acceso", "Credenciales incorrectas: " + error.message);
        } else {
            state.currentUser = data.user;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('dashboard-screen').style.display = 'block';
            loadUserDataFromDatabase();
        }
    });

    document.getElementById('btn-header-logout')?.addEventListener('click', async () => {
        window.UI.showAppConfirm("Cerrar Sesión", "¿Querés salir del sistema?", async () => {
            await _supabase.auth.signOut();
            window.location.reload();
        });
    });

    document.getElementById('global-month-selector')?.addEventListener('change', () => {
        loadUserDataFromDatabase();
    });

    document.getElementById('btn-header-bell')?.addEventListener('click', () => {
        window.UI.openModal('notifications-modal-center');
    });

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
        if (body) {
            body.innerHTML = `
                <div style="background:var(--bg-input); padding:16px; border-radius:10px; margin-bottom:12px; border-left:4px solid ${audit.ratingColor};">
                    <div style="font-weight:700; font-size:15px; color:#fff;">Score Contable: ${audit.score}/100</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Dictamen: <strong>${audit.ratingText}</strong></div>
                </div>
                <ul style="font-size:12px; color:var(--text-muted); line-height:1.6; padding-left:18px;">
                    <li>${audit.transferenciasHuerfanas.length === 0 ? "✓ Partida doble cuadrada" : `⚠ ${audit.transferenciasHuerfanas.length} transferencias desalineadas`}</li>
                    <li>${audit.cuentasEnRojo.length === 0 ? "✓ Cajas operativas en positivo" : `⚠ Cuentas en saldo negativo: ${audit.cuentasEnRojo.join(', ')}`}</li>
                    <li>${audit.tarjetasConDeuda.length === 0 ? "✓ Tarjetas al día (sin saldo pendiente)" : `💳 Deuda en tarjetas: ${audit.tarjetasConDeuda.join(', ')}`}</li>
                    <li>${audit.posiblesDuplicados.length === 0 ? "✓ Sin consumos duplicados" : `⚠ ${audit.posiblesDuplicados.length} posibles consumos repetidos`}</li>
                </ul>
            `;
        }
        window.UI.openModal('audit-preflight-modal');
    });

    document.getElementById('btn-confirm-export-pdf')?.addEventListener('click', () => {
        window.UI.closeModal('audit-preflight-modal');
        exportAuditPDF(state.cachedAuditResult);
    });

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
        if (lblOrigen) lblOrigen.innerText = (t === 'INGRESO') ? 'Cuenta Receptora' : 'Cuenta Débito / Origen';
    };

    window.updateUnifiedFormUI = updateUnifiedFormUI;
    document.getElementById('uni-origen')?.addEventListener('change', updateUnifiedFormUI);

    const hoyIso = getLocalDateString();
    if (document.getElementById('uni-fecha')) document.getElementById('uni-fecha').value = hoyIso;
    if (document.getElementById('audit-fecha')) document.getElementById('audit-fecha').value = hoyIso;

    document.getElementById('unified-engine-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const batch = buildUnifiedTransactionBatch({
            type: document.getElementById('uni-tipo').value,
            fecha: document.getElementById('uni-fecha').value,
            monto: parseFloat(document.getElementById('uni-monto').value),
            concepto: document.getElementById('uni-concepto').value.trim(),
            origen: document.getElementById('uni-origen').value,
            destino: document.getElementById('uni-destino').value,
            categoria: document.getElementById('uni-categoria').value,
            moneda: document.getElementById('uni-moneda').value,
            pureza: document.getElementById('uni-pureza').value,
            excluirGasto: document.getElementById('uni-excluir').checked,
            montoDestino: parseFloat(document.getElementById('uni-monto-destino').value) || 0
        });

        if (!navigator.onLine) {
            saveOfflineQueue(batch);
            window.UI.showToast("Sin conexión: Operación encolada para sincronizar");
            return;
        }

        const { error } = await _supabase.from('transacciones').insert(batch);
        if (error) {
            window.UI.showAppAlert("Error", "No se pudo registrar la operación: " + error.message);
        } else {
            window.UI.showToast("Operación registrada con éxito");
            document.getElementById('uni-monto').value = "";
            document.getElementById('uni-concepto').value = "";
            
            window.UI.selectActionType('GASTO');

            loadUserDataFromDatabase();
            switchView('view-inicio', 'btn-nav-inicio');
        }
    });

    document.getElementById('form-save-budget')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selector = document.getElementById('global-month-selector');
        const periodo = selector ? selector.value : getLocalDateString().substring(0, 7);
        const cat = document.getElementById('pre-cat').value;
        const monto = parseFloat(document.getElementById('pre-mon').value);
        const vencimiento = document.getElementById('pre-fecha').value || null;

        const { error } = await _supabase.from('categorias').upsert([{
            user_id: state.currentUser.id,
            nombre: cat,
            presupuesto_mensual: monto,
            periodo,
            fecha_vencimiento: vencimiento
        }], { onConflict: 'user_id, nombre, periodo' });

        if (error) {
            window.UI.showAppAlert("Error", error.message);
        } else {
            window.UI.showToast("Planificación guardada");
            document.getElementById('pre-mon').value = "";
            document.getElementById('pre-fecha').value = "";
            loadUserDataFromDatabase();
        }
    });

    document.getElementById('btn-clone-budget')?.addEventListener('click', async () => {
        const selector = document.getElementById('global-month-selector');
        const currentPeriodo = selector ? selector.value : getLocalDateString().substring(0, 7);
        const prevPeriodo = getPreviousMonthStr(currentPeriodo);

        window.UI.showAppConfirm("Copiar Presupuesto", `¿Deseas duplicar la asignación presupuestaria de ${prevPeriodo} en este mes?`, async () => {
            const { data: prevBudgets, error } = await _supabase.from('categorias').select('*').eq('periodo', prevPeriodo);
            if (error || !prevBudgets || prevBudgets.length === 0) {
                window.UI.showAppAlert("Sin Registros", `No hay presupuestos previos en ${prevPeriodo} para duplicar.`);
                return;
            }

            const clones = prevBudgets.map(b => ({
                user_id: state.currentUser.id,
                nombre: b.nombre,
                presupuesto_mensual: b.presupuesto_mensual,
                periodo: currentPeriodo,
                fecha_vencimiento: null
            }));

            const { error: insErr } = await _supabase.from('categorias').upsert(clones, { onConflict: 'user_id, nombre, periodo' });
            if (insErr) {
                window.UI.showAppAlert("Error", insErr.message);
            } else {
                window.UI.showToast("Presupuestos duplicados con éxito");
                loadUserDataFromDatabase();
            }
        });
    });

    // CORRECCIÓN CRÍTICA 2B: Edición sincronizada de la partida doble
    document.getElementById('modal-edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.editingTransactionId) return;

        const t = state.globalTransData.find(item => item.id === state.editingTransactionId);
        if (!t) return;

        const payload = {
            fecha: document.getElementById('edit-form-fecha').value,
            monto: parseFloat(document.getElementById('edit-form-importe').value),
            descripcion: document.getElementById('edit-form-concepto').value.trim(),
            cuenta: document.getElementById('edit-form-metodo').value,
            categoria: document.getElementById('edit-form-categoria').value,
            presupuestado: document.getElementById('edit-form-presupuestado').value,
            moneda: document.getElementById('edit-form-moneda').value
        };

        const isGroup = !!t.transfer_group_id;
        const { error } = await _supabase.from('transacciones').update(payload).eq('id', state.editingTransactionId);

        if (error) {
            window.UI.showAppAlert("Error", error.message);
            return;
        }

        if (isGroup) {
            const peer = state.globalTransData.find(item => item.transfer_group_id === t.transfer_group_id && item.id !== t.id);
            if (peer) {
                const peerPayload = { fecha: payload.fecha };
                if (t.categoria !== 'Compra/Venta Divisas') {
                    peerPayload.monto = payload.monto;
                    peerPayload.moneda = payload.moneda;
                }
                await _supabase.from('transacciones').update(peerPayload).eq('id', peer.id);
            }
        }

        window.UI.closeModal('edit-transaction-modal');
        window.UI.showToast(isGroup ? "Transferencia sincronizada con éxito" : "Registro actualizado correctamente");
        loadUserDataFromDatabase();
    });

    document.getElementById('form-audit-adjust')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tipoAjuste = document.getElementById('audit-tipo').value;
        const fecha = document.getElementById('audit-fecha').value;
        const monto = parseFloat(document.getElementById('audit-monto').value);
        const cuenta = document.getElementById('audit-cuenta').value;
        const concepto = document.getElementById('audit-concepto').value.trim();
        const moneda = document.getElementById('audit-moneda').value;

        const payload = {
            user_id: state.currentUser.id,
            tipo: tipoAjuste === 'AJUSTE_POSITIVO' ? 'ingreso' : 'gasto',
            monto,
            fecha,
            categoria: 'Ajuste Técnico Saldos',
            cuenta,
            descripcion: `Reconciliación: ${concepto}`,
            presupuestado: 'NO_COMPUTA',
            moneda,
            autor: state.currentUser.email
        };

        const { error } = await _supabase.from('transacciones').insert([payload]);
        if (error) {
            window.UI.showAppAlert("Error", error.message);
        } else {
            window.UI.showToast("Ajuste contable aplicado con éxito");
            document.getElementById('audit-monto').value = "";
            document.getElementById('audit-concepto').value = "";
            loadUserDataFromDatabase();
        }
    });

    document.getElementById('form-new-category')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-cat-name');
        const catName = input.value.trim();
        if (!catName) return;

        const { error } = await _supabase.from('user_categories').insert([{ user_id: state.currentUser.id, nombre_categoria: catName }]);
        if (error) {
            window.UI.showAppAlert("Error", error.message);
        } else {
            window.UI.showToast(`Categoría "${catName}" añadida con éxito`);
            input.value = "";
            loadUserDataFromDatabase();
        }
    });

    const applyFilters = () => {
        const query = document.getElementById('filter-search')?.value.toLowerCase() || '';
        const fTipo = document.getElementById('filter-tipo')?.value || 'TODOS';
        const fCuenta = document.getElementById('filter-cuenta')?.value || 'TODOS';
        const fCat = document.getElementById('filter-categoria')?.value || 'TODOS';
        const fAutor = document.getElementById('filter-autor')?.value || 'TODOS';

        const filtrados = state.globalTransData.filter(t => {
            const matchQuery = (t.descripcion || '').toLowerCase().includes(query) || (t.categoria || '').toLowerCase().includes(query) || String(t.monto).includes(query);
            const matchTipo = (fTipo === 'TODOS') || (t.tipo === fTipo);
            const matchCuenta = (fCuenta === 'TODOS') || (t.cuenta === fCuenta);
            const matchCat = (fCat === 'TODOS') || (t.categoria === fCat);
            const matchAutor = (fAutor === 'TODOS') || (fAutor === 'dante' && (t.autor || '').includes('dante')) || (fAutor === 'lore' && (t.autor || '').includes('lore'));
            return matchQuery && matchTipo && matchCuenta && matchCat && matchAutor;
        });

        renderTransactionHistoryTable(filtrados);
    };

    document.getElementById('filter-search')?.addEventListener('input', applyFilters);
    document.getElementById('filter-tipo')?.addEventListener('change', applyFilters);
    document.getElementById('filter-cuenta')?.addEventListener('change', applyFilters);
    document.getElementById('filter-categoria')?.addEventListener('change', applyFilters);
    document.getElementById('filter-autor')?.addEventListener('change', applyFilters);
});
