import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';
import { state } from './state.js';

/**
 * Evalúa el desempeño presupuestario en 3 estados: Target, Riesgo, Fuera.
 */
export function calcularEstadoRAG(meta, gasto) {
    if (!meta || meta <= 0) {
        return gasto > 0 ? 'Fuera' : 'Target';
    }
    const ratio = gasto / meta;
    if (ratio <= 1.0) return 'Target';
    if (ratio <= 1.10) return 'Riesgo';
    return 'Fuera';
}

/**
 * Construye el lote de transacciones unificadas con congelamiento de tipo de cambio (H-02).
 */
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

    const baseGroupId = (type === 'TRANSFERENCIA' || type === 'CAMBIO_DIVISAS')
        ? `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        : null;

    const fxRate = (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1;

    if (type === 'GASTO') {
        return [{
            fecha,
            monto: Math.abs(monto),
            descripcion: concepto,
            cuenta: origen,
            categoria: categoria || 'Otros Gastos (Sin Categorizar)',
            tipo: 'gasto',
            presupuestado: excluirGasto ? 'NO_COMPUTA' : 'SI',
            moneda: moneda || 'ARS',
            tipo_cambio: fxRate
        }];
    }

    if (type === 'INGRESO') {
        return [{
            fecha,
            monto: Math.abs(monto),
            descripcion: concepto,
            cuenta: origen,
            categoria: 'Ingresos Laborales / Honorarios',
            tipo: 'ingreso',
            presupuestado: 'NO_COMPUTA',
            moneda: moneda || 'ARS',
            tipo_cambio: fxRate
        }];
    }

    if (type === 'TRANSFERENCIA') {
        const esPagoTarjeta = state.CUENTAS_TARJETAS?.includes(destino);
        const catAsignada = esPagoTarjeta ? 'Pago Tarjeta de Crédito' : 'Transferencia Interna';

        return [
            {
                fecha,
                monto: Math.abs(monto),
                descripcion: esPagoTarjeta ? `Cancelación: ${concepto}` : `Envío: ${concepto}`,
                cuenta: origen,
                categoria: catAsignada,
                tipo: 'gasto',
                presupuestado: 'NO_COMPUTA',
                moneda: moneda || 'ARS',
                tipo_cambio: fxRate,
                transfer_group_id: baseGroupId
            },
            {
                fecha,
                monto: Math.abs(monto),
                descripcion: esPagoTarjeta ? `Pago recibido: ${concepto}` : `Recepción: ${concepto}`,
                cuenta: destino,
                categoria: catAsignada,
                tipo: 'ingreso',
                presupuestado: 'NO_COMPUTA',
                moneda: moneda || 'ARS',
                tipo_cambio: fxRate,
                transfer_group_id: baseGroupId
            }
        ];
    }

    if (type === 'CAMBIO_DIVISAS') {
        const esVentaDolares = (moneda === 'USD');
        const monedaSalida = moneda;
        const monedaEntrada = esVentaDolares ? 'ARS' : 'USD';
        const montoSalida = Math.abs(monto);
        const montoEntrada = Math.abs(montoDestino);

        const implicitFx = (esVentaDolares && montoSalida > 0) 
            ? (montoEntrada / montoSalida) 
            : (montoEntrada > 0 ? montoSalida / montoEntrada : TIPO_CAMBIO_PRESUPUESTO);

        return [
            {
                fecha,
                monto: montoSalida,
                descripcion: `Entrega Divisa: ${concepto}`,
                cuenta: origen,
                categoria: 'Compra/Venta Divisas',
                tipo: 'gasto',
                presupuestado: 'NO_COMPUTA',
                moneda: monedaSalida,
                tipo_cambio: implicitFx,
                transfer_group_id: baseGroupId
            },
            {
                fecha,
                monto: montoEntrada,
                descripcion: `Recepción Divisa: ${concepto}`,
                cuenta: destino,
                categoria: 'Compra/Venta Divisas',
                tipo: 'ingreso',
                presupuestado: 'NO_COMPUTA',
                moneda: monedaEntrada,
                tipo_cambio: implicitFx,
                transfer_group_id: baseGroupId
            }
        ];
    }

    return [];
}

/**
 * Genera cargos de liquidación de tarjeta con congelamiento cambiario y marcas antifraude (H-02, H-04).
 */
export function buildCreditCardClosingBatch(params) {
    const {
        tarjeta,
        fecha,
        impuestosSellos,
        intereses,
        otrosCargos,
        moneda
    } = params;

    const fxRate = (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1;
    const batch = [];

    if (impuestosSellos > 0) {
        batch.push({
            fecha,
            monto: Math.abs(impuestosSellos),
            descripcion: `Liquidación Resumen: Impuesto de Sellos (${tarjeta})`,
            cuenta: tarjeta,
            categoria: 'Impuestos y Sellos',
            tipo: 'gasto',
            presupuestado: 'SI',
            moneda: moneda || 'ARS',
            tipo_cambio: fxRate
        });
    }

    if (intereses > 0) {
        batch.push({
            fecha,
            monto: Math.abs(intereses),
            descripcion: `Liquidación Resumen: Intereses Financieros (${tarjeta})`,
            cuenta: tarjeta,
            categoria: 'Intereses Financieros',
            tipo: 'gasto',
            presupuestado: 'SI',
            moneda: moneda || 'ARS',
            tipo_cambio: fxRate
        });
    }

    if (otrosCargos > 0) {
        batch.push({
            fecha,
            monto: Math.abs(otrosCargos),
            descripcion: `Liquidación Resumen: Comisiones y Renovación (${tarjeta})`,
            cuenta: tarjeta,
            categoria: 'Comisiones y Cargos Bancarios',
            tipo: 'gasto',
            presupuestado: 'SI',
            moneda: moneda || 'ARS',
            tipo_cambio: fxRate
        });
    }

    return batch;
}

/**
 * Motor de Auditoría Financiera Contable Integral.
 */
export function executeFinancialAuditEngine() {
    let score = 100;
    const transferenciasHuerfanas = [];
    const cuentasEnRojo = [];
    const tarjetasConDeuda = [];
    const posiblesDuplicados = [];

    const mapGrupos = {};
    state.globalTransData.forEach(t => {
        if (t.transfer_group_id) {
            mapGrupos[t.transfer_group_id] = (mapGrupos[t.transfer_group_id] || 0) + 1;
        }
    });

    Object.keys(mapGrupos).forEach(grpId => {
        if (mapGrupos[grpId] !== 2) {
            transferenciasHuerfanas.push(grpId);
            score -= 15;
        }
    });

    Object.keys(state.currentAccountBalancesARS).forEach(acc => {
        if (state.currentAccountBalancesARS[acc] < 0) {
            cuentasEnRojo.push(`${acc} (ARS $${Math.round(state.currentAccountBalancesARS[acc]).toLocaleString('es-AR')})`);
            score -= 10;
        }
    });

    Object.keys(state.creditCardDebtARS).forEach(card => {
        const d = (state.creditCardDebtARS[card] || 0) + ((state.creditCardDebtUSD[card] || 0) * TIPO_CAMBIO_PRESUPUESTO);
        if (d > 0) {
            tarjetasConDeuda.push(`${card} ($${Math.round(d).toLocaleString('es-AR')})`);
        }
    });

    const signatures = new Set();
    state.globalTransData.slice(0, 100).forEach(t => {
        const sig = `${t.fecha}_${t.cuenta}_${t.monto}_${t.descripcion}`;
        if (signatures.has(sig)) {
            posiblesDuplicados.push(t.descripcion);
            score -= 5;
        } else {
            signatures.add(sig);
        }
    });

    score = Math.max(0, Math.min(100, score));

    let ratingText = 'Excelente Cuadre Contable';
    let ratingColor = 'var(--primary)';
    if (score < 80 && score >= 50) {
        ratingText = 'Observaciones Moderadas';
        ratingColor = 'var(--warning)';
    } else if (score < 50) {
        ratingText = 'Descuadre Contable Severo';
        ratingColor = 'var(--danger)';
    }

    const auditResult = {
        score,
        ratingText,
        ratingColor,
        transferenciasHuerfanas,
        cuentasEnRojo,
        tarjetasConDeuda,
        posiblesDuplicados
    };

    state.cachedAuditResult = auditResult;
    return auditResult;
}
