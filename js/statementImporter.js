import { state, getLocalDateString } from './state.js';
import { TIPO_CAMBIO_PRESUPUESTO } from './supabaseClient.js';

const PREDICTIVE_CATEGORIES = [
    { pattern: /telepeaje|corresur|autopista|ausol|aubasa|camino.*pque|peaje/i, targets: ['peaje', 'transporte', 'auto', 'vehiculo'] },
    { pattern: /movistar|claro|personal|telecentro|fibertel|internet/i, targets: ['telefono', 'telefonia', 'comunicacion', 'servicios', 'internet'] },
    { pattern: /caja.*seguro|lacaja|seguro|sancor|mercantil/i, targets: ['seguro', 'auto'] },
    { pattern: /mcdonald|burger|mostaza|starbucks|cafe|parrill|restaurante|heladeria|homeroparrill/i, targets: ['salidas', 'gastronomia', 'comida', 'restaurante'] },
    { pattern: /apple|google|netflix|spotify|prime|disney|max|youtube/i, targets: ['apple', 'suscripcion', 'streaming', 'servicios'] },
    { pattern: /farmacity|farmacia|osde|swiss/i, targets: ['salud', 'farmacia', 'medicina'] },
    { pattern: /coto|carrefour|jumbo|disco|vea|dia%/i, targets: ['supermercado', 'super', 'alimentos'] },
    { pattern: /ypf|shell|axion|puma|combustible/i, targets: ['nafta', 'combustible', 'auto'] },
    { pattern: /dash|sport|nike|adidas|indumentaria|ropa|zapat/i, targets: ['indumentaria', 'ropa', 'deporte'] },
    { pattern: /pbkids|brinquedos|juguete/i, targets: ['juguete', 'niño', 'hijos'] },
    { pattern: /beleza|perfum|cosmet/i, targets: ['cuidado', 'belleza', 'farmacia'] },
    { pattern: /prosegur|alarma/i, targets: ['prosegur', 'seguridad', 'hogar', 'servicios'] },
    { pattern: /merpago|mercado.*pago/i, targets: ['mercado pago', 'varios', 'gastos varios'] }
];

export function matchUserCategory(desc, userCategories = []) {
    if (!desc || !userCategories || userCategories.length === 0) return userCategories?.[0] || 'Otros Gastos';
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
 * Parsea el extracto bancario (.xlsx) e imputa la fecha al mes de liquidación presupuestaria seleccionado.
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
            let foundTitularSection = false;
            let tableStarted = false;

            for (let i = 0; i < rawData.length; i++) {
                if (i < 19) continue;

                const row = rawData[i];
                if (!row || row.length < 5) continue;

                const col0 = String(row[0] || '').trim();
                const col1 = String(row[1] || '').trim();

                if (col0.toLowerCase().includes('tarjeta de') && col0.toLowerCase().includes('terminada en')) {
                    foundTitularSection = true;
                    continue;
                }

                if (!foundTitularSection) continue;

                if (col0.toLowerCase() === 'fecha' && col1.toLowerCase().includes('descrip')) {
                    tableStarted = true;
                    continue;
                }

                if (!tableStarted) continue;

                if (col0.toLowerCase().startsWith('subtotal') || (col0 === '' && col1 === '')) {
                    break;
                }

                const descripcion = col1;
                if (/su pago en|pago por débito/i.test(descripcion)) {
                    continue;
                }

                // Fecha original de la compra física
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

                // Formateo de fecha de compra para el memo
                const dateParts = originalPurchaseDate.split('-');
                const displayPurchaseDate = (dateParts.length === 3) 
                    ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` 
                    : originalPurchaseDate;

                // Asignación de fecha contable de imputación (Mes de Pago del Resumen)
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
                
                // Anexa la fecha real de compra al memo
                const memoFinal = `${memoBase} [Compra: ${displayPurchaseDate}]`;

                // Control de duplicados en el mes de destino
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
