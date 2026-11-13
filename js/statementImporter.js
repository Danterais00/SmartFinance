import { state, getLocalDateString } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

const PREDICTIVE_CATEGORIES = [
    { pattern: /telepeaje|corresur|autopista|ausol|aubasa|camino.*pque|peaje/i, targets: ['peaje', 'transporte', 'auto', 'vehiculo'] },
    { pattern: /movistar|claro|personal|telecentro|fibertel|internet/i, targets: ['telefono', 'telefonia', 'comunicacion', 'servicios', 'internet'] },
    { pattern: /caja.*seguro|lacaja|seguro|sancor|mercantil/i, targets: ['seguro', 'auto'] },
    { pattern: /mcdonald|burger|mostaza|starbucks|cafe|parrill|restaurante|heladeria|homeroparrill|mooi/i, targets: ['salidas', 'gastronomia', 'comida', 'restaurante'] },
    { pattern: /apple|google|netflix|spotify|prime|disney|max|youtube/i, targets: ['apple', 'suscripcion', 'streaming', 'servicios'] },
    { pattern: /farmacity|farmacia|osde|swiss|widex|optica|alemana|audifono/i, targets: ['farmacia', 'salud', 'medicina', 'bienestar'] },
    { pattern: /coto|carrefour|jumbo|disco|vea|dia%/i, targets: ['supermercado', 'super', 'alimentos'] },
    { pattern: /ypf|shell|axion|puma|combustible/i, targets: ['nafta', 'combustible', 'auto'] },
    { pattern: /dash|sport|nike|adidas|indumentaria|ropa|zapat/i, targets: ['indumentaria', 'ropa', 'deporte'] },
    { pattern: /pbkids|brinquedos|juguete/i, targets: ['juguete', 'niño', 'hijos'] },
    { pattern: /beleza|perfum|cosmet/i, targets: ['cuidado', 'belleza', 'farmacia'] },
    { pattern: /prosegur|alarma/i, targets: ['prosegur', 'seguridad', 'hogar', 'servicios'] },
    { pattern: /merpago|mercado.*pago/i, targets: ['mercado pago', 'varios', 'gastos varios'] }
];

export function matchUserCategory(desc, userCategories = []) {
    if (!desc || !userCategories || userCategories.length === 0) return userCategories?.[0] || 'Otros Gastos (Sin Categorizar)';
    const d = desc.toLowerCase();

    for (let cat of userCategories) {
        if (cat.length >= 3 && d.includes(cat.toLowerCase())) {
            return cat;
        }
    }

    for (let rule of PREDICTIVE_CATEGORIES) {
        if (rule.pattern.test(d)) {
            for (let t of rule.targets) {
                const found = userCategories.find(c => c.toLowerCase().includes(t));
                if (found) return found;
            }
        }
    }

    const generic = userCategories.find(c => /varios|otros|general/i.test(c));
    return generic || userCategories[0];
}

function parseMonto(val) {
    if (!val || val === '') return 0;
    let s = String(val).replace(/U\$S/gi, '').replace(/\$/g, '').replace(/\s+/g, '').replace(/\xa0/g, '');
    s = s.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
}

/**
 * Parsea el extracto bancario (.xlsx), procesando todos los plásticos asociados (titular, renovaciones y adicionales)
 * e imputando la fecha contable al mes de liquidación seleccionado.
 */
export function parseVisaStatement(excelFileBuffer, selectedAccount, userCategories = [], targetPeriod = null) {
    return new Promise((resolve, reject) => {
        try {
            if (!window.XLSX) {
                throw new Error("Librería SheetJS no encontrada.");
            }

            const workbook = window.XLSX.read(excelFileBuffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rawData = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
            
            let consumos = [];
            let lastValidDate = getLocalDateString();
            let currentCardHeader = "";
            let inCardSection = false;
            let tableStarted = false;
            let inOtrosConceptos = false;

            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length < 2) continue;

                const col0 = String(row[0] || '').trim();
                const col1 = String(row[1] || '').trim();

                if (col0.toLowerCase() === 'otros conceptos') {
                    inOtrosConceptos = true;
                    inCardSection = false;
                    tableStarted = false;
                    continue;
                }

                if (inOtrosConceptos) {
                    if (col0.toLowerCase() === 'descripción' || (col0 === '' && col1 === '')) continue;
                    if (col0.toLowerCase().startsWith('aviso importante') || col0.toLowerCase().startsWith('total')) { inOtrosConceptos = false; continue; }
                    const monto = parseMonto(row[1]);
                    if (monto > 0) {
                        const descImpuesto = `Resumen - ${col0} [Cierre]`;
                        const isDuplicate = state.globalTransData.some(t => t.cuenta === selectedAccount && t.moneda === 'ARS' && Math.abs(Math.abs(parseFloat(t.monto)) - monto) < 1.0 && (t.fecha && t.fecha.substring(0,7) === targetPeriod) && t.descripcion === descImpuesto);
                        consumos.push({
                            id_temp: `imp_${Date.now()}_${i}`,
                            fecha: targetPeriod ? `${targetPeriod}-01` : lastValidDate,
                            fechaOriginal: lastValidDate,
                            monto: monto,
                            montoRaw: monto,
                            moneda: 'ARS',
                            tipo_cambio: 1,
                            descripcion: `Resumen - ${col0} [Cierre]`,
                            categoria: 'Impuestos y Sellos',
                            esPendiente: false,
                            esCredito: false,
                            isDuplicate: isDuplicate,
                            selected: !isDuplicate
                        });
                    }
                    continue;
                }

                // 1. Detección de una sección formal de tarjeta (Titular, renovación o adicional)
                // Excluye subtotales y títulos genéricos de cabecera de cuenta
                if (
                    col0.toLowerCase().includes('terminada en') &&
                    (col0.toLowerCase().includes('tarjeta de') || col0.toLowerCase().includes('adicional de')) &&
                    !col0.toLowerCase().startsWith('subtotal') &&
                    !col0.toLowerCase().startsWith('total de')
                ) {
                    currentCardHeader = col0;
                    inCardSection = true;
                    tableStarted = false;
                    continue;
                }

                // 2. Si no estamos dentro de un bloque de consumos de plástico, ignorar filas
                if (!inCardSection) continue;

                // 3. Detección de la cabecera de la tabla de consumos
                if (col0.toLowerCase() === 'fecha' && col1.toLowerCase().includes('descrip')) {
                    tableStarted = true;
                    continue;
                }

                if (!tableStarted) continue;

                // 4. Fin del bloque de consumos del plástico actual:
                // No abortamos con break; reseteamos el estado para permitir leer siguientes plásticos.
                if (col0.toLowerCase().startsWith('subtotal') || col0.toLowerCase().startsWith('total de') || (col0 === '' && col1 === '')) {
                    tableStarted = false;
                    inCardSection = false;
                    currentCardHeader = "";
                    continue;
                }

                const descripcion = col1;
                // Excluye pagos directos y débitos de resumen si aparecieran en la tabla
                if (/su pago en|pago por débito/i.test(descripcion)) {
                    continue;
                }

                // 5. Parseo de Fecha de compra original
                let originalPurchaseDate = col0;
                if (originalPurchaseDate === "") {
                    originalPurchaseDate = lastValidDate;
                } else {
                    if (originalPurchaseDate.includes('/')) {
                        const parts = originalPurchaseDate.split('/');
                        if (parts.length === 3) {
                            originalPurchaseDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        }
                    }
                    lastValidDate = originalPurchaseDate;
                }

                const dateParts = originalPurchaseDate.split('-');
                const displayPurchaseDate = (dateParts.length === 3) 
                    ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` 
                    : originalPurchaseDate;

                // Fecha contable de imputación (primer día del período de pago seleccionado)
                const fechaContable = targetPeriod ? `${targetPeriod}-01` : originalPurchaseDate;

                const cuotas = String(row[2] || '').trim();
                const pesos = parseMonto(row[4]);
                const dolares = parseMonto(row[5]);
                
                const isPesos = (pesos !== 0 || (pesos === 0 && dolares === 0));
                const montoRaw = isPesos ? pesos : dolares;
                const esCredito = (montoRaw < 0);
                const montoAbsoluto = Math.abs(montoRaw);
                const moneda = isPesos ? 'ARS' : 'USD';
                const esPendiente = descripcion.toLowerCase().includes('pendiente');

                let memoBase = descripcion.replace(/\s+/g, ' ').trim();
                if (cuotas && !memoBase.includes(cuotas)) memoBase += ` (${cuotas})`;
                
                const memoFinal = `${memoBase} [Compra: ${displayPurchaseDate}]`;

                // Control preventivo de consumos ya cargados en la base de datos
                const isDuplicate = state.globalTransData.some(t => {
                    const matchAcc = (t.cuenta === selectedAccount);
                    const matchMon = (t.moneda === moneda);
                    const matchMonto = Math.abs(Math.abs(parseFloat(t.monto)) - montoAbsoluto) < 1.0;
                    const matchPeriodo = targetPeriod 
                        ? (t.fecha && t.fecha.substring(0, 7) === targetPeriod) 
                        : (t.fecha === originalPurchaseDate);
                    const matchMemo = (t.descripcion || '').toLowerCase().includes(memoBase.toLowerCase());
                    return matchAcc && matchMon && matchMonto && matchPeriodo && matchMemo;
                });

                consumos.push({
                    id_temp: `imp_${Date.now()}_${i}`,
                    fecha: fechaContable,
                    fechaOriginal: originalPurchaseDate,
                    monto: montoAbsoluto,
                    montoRaw: montoRaw,
                    moneda: moneda,
                    tipo_cambio: (moneda === 'USD') ? TIPO_CAMBIO_PRESUPUESTO : 1,
                    descripcion: memoFinal,
                    categoria: matchUserCategory(descripcion, userCategories),
                    esPendiente: esPendiente,
                    esCredito: esCredito,
                    isDuplicate: isDuplicate,
                    selected: !isDuplicate
                });
            }

            resolve(consumos);
        } catch (error) {
            reject(error);
        }
    });
}