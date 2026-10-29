import { state, CUENTAS_OPERATIVAS, getLocalDateString } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

/**
 * Generador estándar de UUID v4 compatible al 100% con el tipo de datos UUID de PostgreSQL.
 * Cumple estrictamente con la especificación RFC 4122 (formato 8-4-4-4-12 hex).
 */
export function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback estándar RFC 4122 v4 en caso de ejecución en entornos restringidos
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

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
        tarjetasConDeuda: [],
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

    // 2. Auditoría de Saldos Negativos en Cajas Operativas
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

    // 3. Auditoría de Posibles Gastos Duplicados (Mismo día, cuenta, categoría y monto)
    let gastosMes = currentMonthTxs.filter(t => t.tipo === 'gasto' && t.presupuestado !== 'NO_COMPUTA' && t.categoria !== 'Transferencia Interna' && t.categoria !== 'Compra/Venta Divisas');
    for (let i = 0; i < gastosMes.length; i++) {
        for (let j = i + 1; j < gastosMes.length; j++) {
            let t1 = gastosMes[i];
            let t2 = gastosMes[j];
            if (t1.monto === t2.monto && t1.categoria === t2.categoria && t1.cuenta === t2.cuenta && t1.fecha === t2.fecha) {
                auditFindings.posiblesDuplicados.push(`$${parseFloat(t1.monto).toLocaleString('es-AR')} en ${t1.categoria} (${t1.fecha})`);
                auditFindings.score -= 5;
            }
        }
    }

    // 4. Auditoría de Compromisos Fijos con Vencimiento no Pagados
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

export function buildUnifiedTransactionBatch(params) {
    const {
        type,
        fecha,
        monto,
        concepto,
        origen,
        destino,
        categoria,
        moneda,
        pureza,
        excluirGasto,
        montoDestino
    } = params;

    // Generación de UUID RFC 4122 canónico para partida doble
    const transferGroupId = (type === 'TRANSFERENCIA' || type === 'CAMBIO_DIVISAS' || (type === 'RENDIMIENTO' && pureza !== 'METRICA')) 
        ? generateUUID() 
        : null;

    let batch = [];
    if (type === 'GASTO') {
        const etiquetaPresupuesto = excluirGasto 
            ? 'NO_COMPUTA' 
            : (state.globalBudgetData.some(b => b.nombre === categoria && parseFloat(b.presupuesto_mensual) > 0) ? 'SI' : 'NO');
        
        batch.push({
            tipo: 'gasto',
            monto: Math.abs(monto),
            fecha,
            categoria,
            cuenta: origen,
            descripcion: concepto,
            presupuestado: etiquetaPresupuesto,
            moneda,
            tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1
        });
    } else if (type === 'INGRESO') {
        batch.push({
            tipo: 'ingreso',
            monto: Math.abs(monto),
            fecha,
            categoria: 'Ingreso',
            cuenta: origen,
            descripcion: concepto,
            presupuestado: 'NO',
            moneda,
            tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1
        });
    } else if (type === 'TRANSFERENCIA') {
        batch.push(
            {
                tipo: 'gasto',
                monto: Math.abs(monto),
                fecha,
                categoria: 'Transferencia Interna',
                cuenta: origen,
                descripcion: `Pase hacia ${destino}`,
                presupuestado: 'NO',
                moneda,
                tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                transfer_group_id: transferGroupId
            },
            {
                tipo: 'ingreso',
                monto: Math.abs(monto),
                fecha,
                categoria: 'Transferencia Interna',
                cuenta: destino,
                descripcion: `Pase desde ${origen}`,
                presupuestado: 'NO',
                moneda,
                tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                transfer_group_id: transferGroupId
            }
        );
    } else if (type === 'RENDIMIENTO') {
        if (pureza === 'METRICA') {
            batch.push({
                tipo: 'ingreso',
                monto: Math.abs(monto),
                fecha,
                categoria: 'Rendimiento Inversiones',
                cuenta: origen,
                descripcion: concepto,
                presupuestado: 'NO',
                moneda,
                tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1
            });
        } else {
            batch.push(
                {
                    tipo: 'ingreso',
                    monto: Math.abs(monto),
                    fecha,
                    categoria: 'Rendimiento Inversiones',
                    cuenta: origen,
                    descripcion: 'Interés neto líquido',
                    presupuestado: 'NO',
                    moneda,
                    tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1
                },
                {
                    tipo: 'gasto',
                    monto: Math.abs(monto),
                    fecha,
                    categoria: 'Transferencia Interna',
                    cuenta: origen,
                    descripcion: `Pase hacia ${destino}`,
                    presupuestado: 'NO',
                    moneda,
                    tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                    transfer_group_id: transferGroupId
                },
                {
                    tipo: 'ingreso',
                    monto: Math.abs(monto),
                    fecha,
                    categoria: 'Transferencia Interna',
                    cuenta: destino,
                    descripcion: `Pase desde ${origen}`,
                    presupuestado: 'NO',
                    moneda,
                    tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                    transfer_group_id: transferGroupId
                }
            );
        }
    } else if (type === 'CAMBIO_DIVISAS') {
        const monedaDestino = (moneda === 'ARS') ? 'USD' : 'ARS';
        batch.push(
            {
                tipo: 'gasto',
                monto: Math.abs(monto),
                fecha,
                categoria: 'Compra/Venta Divisas',
                cuenta: origen,
                descripcion: concepto,
                presupuestado: 'NO_COMPUTA',
                moneda,
                tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                transfer_group_id: transferGroupId
            },
            {
                tipo: 'ingreso',
                monto: Math.abs(montoDestino),
                fecha,
                categoria: 'Compra/Venta Divisas',
                cuenta: destino,
                descripcion: concepto,
                presupuestado: 'NO',
                moneda: monedaDestino,
                tipo_cambio: (monedaDestino === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                transfer_group_id: transferGroupId
            }
        );
    }

    return batch;
}

export function buildCreditCardClosingBatch(params) {
    const { tarjeta, fecha, impuestosSellos, intereses, otrosCargos, moneda } = params;
    const batch = [];
    const fx = (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1;

    if (impuestosSellos > 0) {
        batch.push({
            tipo: 'gasto',
            monto: impuestosSellos,
            fecha,
            categoria: 'Impuestos y Sellos',
            cuenta: tarjeta,
            descripcion: `Resumen ${tarjeta} - Impuestos y Sellos`,
            presupuestado: 'SI',
            moneda,
            tipo_cambio: fx
        });
    }

    if (intereses > 0) {
        batch.push({
            tipo: 'gasto',
            monto: intereses,
            fecha,
            categoria: 'Intereses Financieros',
            cuenta: tarjeta,
            descripcion: `Resumen ${tarjeta} - Intereses Financieros`,
            presupuestado: 'SI',
            moneda,
            tipo_cambio: fx
        });
    }

    if (otrosCargos > 0) {
        batch.push({
            tipo: 'gasto',
            monto: otrosCargos,
            fecha,
            categoria: 'Servicios Bancarios',
            cuenta: tarjeta,
            descripcion: `Resumen ${tarjeta} - Cargos de Emisión / Renovación`,
            presupuestado: 'SI',
            moneda,
            tipo_cambio: fx
        });
    }

    return batch;
}
