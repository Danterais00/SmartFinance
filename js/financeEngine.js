import { state, CUENTAS_OPERATIVAS, getLocalDateString } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

export function calcularEstadoRAG(meta, gasto) {
    if (gasto <= meta) return 'Target'; 
    let desvioPct = meta > 0 ? ((gasto - meta) / meta) * 100 : 100;
    if (parseFloat(desvioPct.toFixed(1)) <= 0) return 'Target';
    if (desvioPct <= 10) return 'Riesgo'; 
    return 'Fuera'; 
}

export function executeFinancialAuditEngine() {
    const selector = document.getElementById('global-month-selector');
    const activeMonthFilter = selector ? selector.value : getLocalDateString().substring(0, 7);
    
    let currentMonthTxs = state.globalTransData.filter(t => t.fecha && t.fecha.substring(0, 7) === activeMonthFilter);
    
    let auditFindings = {
        score: 100,
        ratingText: "Excelente (Auditado)",
        ratingColor: "var(--primary)",
        transferenciasHuerfanas: [],
        cuentasEnRojo: [],
        posiblesDuplicados: [],
        vencimientosImpagos: []
    };

    // 1. Auditoría de Partida Doble en Transferencias y Divisas
    let transferGroups = {};
    currentMonthTxs.forEach(t => {
        if (t.categoria === 'Transferencia Interna' || t.categoria === 'Compra/Venta Divisas') {
            let grp = t.transfer_group_id || `${t.fecha}_${t.monto}_${t.descripcion}`;
            if (!transferGroups[grp]) transferGroups[grp] = [];
            transferGroups[grp].push(t);
        }
    });

    for (let gId in transferGroups) {
        let txs = transferGroups[gId];
        let hasGasto = txs.some(t => t.tipo === 'gasto');
        let hasIngreso = txs.some(t => t.tipo === 'ingreso');
        if (!hasGasto || !hasIngreso) {
            auditFindings.transferenciasHuerfanas.push(txs[0]);
            auditFindings.score -= 15;
        }
    }

    // 2. Auditoría de Cajas Negativas
    CUENTAS_OPERATIVAS.forEach(acc => {
        let sARS = state.currentAccountBalancesARS[acc] || 0;
        let sUSD = state.currentAccountBalancesUSD[acc] || 0;
        if (sARS < 0) {
            auditFindings.cuentasEnRojo.push(`${acc} ($${sARS.toLocaleString('es-AR')})`);
            auditFindings.score -= 10;
        }
        if (sUSD < 0) {
            auditFindings.cuentasEnRojo.push(`${acc} (u$d ${sUSD.toLocaleString('es-AR')})`);
            auditFindings.score -= 10;
        }
    });

    // 3. Auditoría de Gastos Duplicados
    let gastosMes = currentMonthTxs.filter(t => t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA' && t.categoria !== 'Transferencia Interna' && t.categoria !== 'Compra/Venta Divisas');
    for (let i = 0; i < gastosMes.length; i++) {
        for (let j = i + 1; j < gastosMes.length; j++) {
            let t1 = gastosMes[i];
            let t2 = gastosMes[j];
            if (t1.monto === t2.monto && t1.categoria === t2.categoria && t1.cuenta === t2.cuenta && t1.fecha === t2.fecha) {
                auditFindings.posiblesDuplicados.push(`$${t1.monto.toLocaleString('es-AR')} en ${t1.categoria} (${t1.fecha})`);
                auditFindings.score -= 5;
            }
        }
    }

    // 4. Auditoría de Compromisos Fijos con Vencimiento Impagos
    const todayIso = getLocalDateString();
    state.currentMonthAlertsCache.forEach(al => {
        if (al.status === 'overdue' || (al.status === 'today' && al.fechaRaw < todayIso)) {
            auditFindings.vencimientosImpagos.push(`${al.categoria} (Venció ${al.fechaFormateada})`);
            auditFindings.score -= 5;
        }
    });

    auditFindings.score = Math.max(0, Math.min(100, auditFindings.score));
    if (auditFindings.score >= 90) {
        auditFindings.ratingText = "Excelente (Sólida)";
        auditFindings.ratingColor = "var(--primary)";
    } else if (auditFindings.score >= 70) {
        auditFindings.ratingText = "Aceptable con Observaciones";
        auditFindings.ratingColor = "var(--warning)";
    } else {
        auditFindings.ratingText = "Atención: Inconsistencias Detectadas";
        auditFindings.ratingColor = "var(--danger)";
    }

    state.cachedAuditResult = auditFindings;
    return auditFindings;
}

export function buildUnifiedTransactionBatch({ type, fecha, monto, concepto, origen, destino, categoria, moneda, pureza, excluirGasto, montoDestino }) {
    const transferGroupId = (type === 'TRANSFERENCIA' || type === 'CAMBIO_DIVISAS' || (type === 'RENDIMIENTO' && pureza !== 'METRICA')) ? crypto.randomUUID() : null;
    let batch = [];

    if (type === 'GASTO') {
        const etiquetaPresupuesto = excluirGasto ? 'NO_COMPUTA' : (state.globalBudgetData.some(b => b.nombre === categoria && parseFloat(b.presupuesto_mensual) > 0) ? 'SI' : 'NO');
        batch.push({
            user_id: state.currentUser.id, tipo: 'gasto', monto, fecha, categoria,
            cuenta: origen, descripcion: concepto, presupuestado: etiquetaPresupuesto,
            moneda, autor: state.currentUser.email,
            tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null
        });
    } else if (type === 'INGRESO') {
        batch.push({
            user_id: state.currentUser.id, tipo: 'ingreso', monto, fecha, categoria: 'Ingreso',
            cuenta: origen, descripcion: concepto, presupuestado: 'NO',
            moneda, autor: state.currentUser.email,
            tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null
        });
    } else if (type === 'TRANSFERENCIA') {
        batch.push(
            { user_id: state.currentUser.id, tipo: 'gasto', monto, fecha, categoria: 'Transferencia Interna', cuenta: origen, descripcion: `Pase hacia ${destino}`, presupuestado: 'NO', moneda, autor: state.currentUser.email, tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null, transfer_group_id: transferGroupId },
            { user_id: state.currentUser.id, tipo: 'ingreso', monto, fecha, categoria: 'Transferencia Interna', cuenta: destino, descripcion: `Pase desde ${origen}`, presupuestado: 'NO', moneda, autor: state.currentUser.email, tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null, transfer_group_id: transferGroupId }
        );
    } else if (type === 'RENDIMIENTO') {
        if (pureza === 'METRICA') { 
            batch.push({ user_id: state.currentUser.id, tipo: 'ingreso', monto, fecha, categoria: 'Rendimiento Inversiones', cuenta: origen, descripcion: concepto, presupuestado: 'NO', moneda, autor: state.currentUser.email, tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null }); 
        } else {
            batch.push(
                { user_id: state.currentUser.id, tipo: 'ingreso', monto, fecha, categoria: 'Rendimiento Inversiones', cuenta: origen, descripcion: 'Interés neto líquido', presupuestado: 'NO', moneda, autor: state.currentUser.email, tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null },
                { user_id: state.currentUser.id, tipo: 'gasto', monto, fecha, categoria: 'Transferencia Interna', cuenta: origen, descripcion: `Pase hacia ${destino}`, presupuestado: 'NO', moneda, autor: state.currentUser.email, tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null, transfer_group_id: transferGroupId },
                { user_id: state.currentUser.id, tipo: 'ingreso', monto, fecha, categoria: 'Transferencia Interna', cuenta: destino, descripcion: `Pase desde ${origen}`, presupuestado: 'NO', moneda, autor: state.currentUser.email, tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null, transfer_group_id: transferGroupId }
            );
        }
    } else if (type === 'CAMBIO_DIVISAS') {
        const monedaDestino = moneda === 'ARS' ? 'USD' : 'ARS';
        batch.push(
            { user_id: state.currentUser.id, tipo: 'gasto', monto: monto, fecha, categoria: 'Compra/Venta Divisas', cuenta: origen, descripcion: concepto, presupuestado: 'NO_COMPUTA', moneda: moneda, autor: state.currentUser.email, tipo_cambio: moneda === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null, transfer_group_id: transferGroupId },
            { user_id: state.currentUser.id, tipo: 'ingreso', monto: montoDestino, fecha, categoria: 'Compra/Venta Divisas', cuenta: destino, descripcion: concepto, presupuestado: 'NO', moneda: monedaDestino, autor: state.currentUser.email, tipo_cambio: monedaDestino === 'USD' ? TIPO_CAMBIO_PRESUPUESTO : null, transfer_group_id: transferGroupId }
        );
    }

    return batch;
}
