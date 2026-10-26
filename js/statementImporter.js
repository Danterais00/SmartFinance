import { state, getLocalDateString } from './state.js';

// Diccionario predictivo de autocompletado de categorías
const PREDICTIVE_CATEGORIES = [
    { pattern: /telepeaje|corresur|autopista|ausol|aubasa|camino.*pque|peaje/i, cat: 'Transporte / Peajes' },
    { pattern: /movistar|claro|personal|telecentro|fibertel/i, cat: 'Comunicaciones / Telefonía' },
    { pattern: /caja.*seguro|sancor|mercantil|seguro/i, cat: 'Seguros' },
    { pattern: /mcdonald|burger|mostaza|starbucks|cafe|parrill|restaurante|heladeria|rappi|pedidosya/i, cat: 'Salidas / Gastronomía' },
    { pattern: /apple|google|netflix|spotify|prime.*video|disney|max|youtube/i, cat: 'Suscripciones / Streaming' },
    { pattern: /farmacity|farmacia|osde|swiss.*medical/i, cat: 'Salud y Cuidado Personal' },
    { pattern: /coto|carrefour|jumbo|disco|vea|dia%/i, cat: 'Supermercado' },
    { pattern: /ypf|shell|axion|puma/i, cat: 'Nafta / Combustible' },
    { pattern: /dash.*deportes|sport|nike|adidas|indumentaria|ropa|zapat/i, cat: 'Indumentaria' },
    { pattern: /pbkids|brinquedos|juguete|jugueteria/i, cat: 'Juguetería / Niños' },
    { pattern: /beleza|perfum|cosmet/i, cat: 'Cuidado Personal y Belleza' },
    { pattern: /prosegur|alarma/i, cat: 'Seguridad y Hogar' },
    { pattern: /merpago|mercado.*pago/i, cat: 'Mercado Pago (Revisar)' }
];

export function predictCategory(desc) {
    if (!desc) return 'Otros Gastos (Sin Categorizar)';
    for (let rule of PREDICTIVE_CATEGORIES) {
        if (rule.pattern.test(desc)) return rule.cat;
    }
    return 'Otros Gastos (Sin Categorizar)';
}

function parseMonto(val) {
    if (!val || val === '') return 0;
    // Remueve 'U$S' antes que '$' para proteger el parseo de montos en dólares
    let s = String(val).replace(/U\$S/gi, '').replace(/\$/g, '').replace(/\s+/g, '').replace(/\xa0/g, '');
    s = s.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
}

export function parseVisaStatement(excelFileBuffer, selectedAccount) {
    return new Promise((resolve, reject) => {
        try {
            if (!window.XLSX) {
                throw new Error("Librería SheetJS no encontrada en la aplicación.");
            }

            const workbook = window.XLSX.read(excelFileBuffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rawData = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
            
            let consumos = [];
            let lastValidDate = getLocalDateString();
            let inConsumosTable = false;
            let inPagosSection = false;

            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length < 5) continue;

                const col0 = String(row[0] || '').trim();
                const col1 = String(row[1] || '').trim();

                // 1. Excluir el bloque completo de "Pago de tarjeta y devoluciones"
                if (col0.toLowerCase().includes('pago de tarjeta y devoluciones')) {
                    inPagosSection = true;
                    inConsumosTable = false;
                    continue;
                }

                // 2. Identificar el inicio de los consumos del titular
                if (col0.toLowerCase().includes('tarjeta de') && col0.toLowerCase().includes('terminada en')) {
                    inPagosSection = false;
                    continue;
                }

                // 3. Saltear al llegar a los subtotales finales
                if (col0.toLowerCase().startsWith('subtotal')) {
                    inConsumosTable = false;
                    continue;
                }

                // 4. Detectar la fila de cabecera "Fecha", "Descripción"...
                if (col0.toLowerCase() === 'fecha' && col1.toLowerCase().includes('descrip')) {
                    if (inPagosSection) {
                        inConsumosTable = false; // Ignorar tabla de pagos y devoluciones
                    } else {
                        inConsumosTable = true;  // Tabla real de consumos
                    }
                    continue;
                }

                if (!inConsumosTable) continue;
                if (col0 === '' && col1 === '') continue;

                const descripcion = col1;
                // Exclusión de seguridad si aparece un pago o crédito de percepción
                if (/su pago en|pago por|cr\.rg 5617/i.test(descripcion)) {
                    continue;
                }

                // Forward-fill: hereda la fecha de la fila anterior cuando hay consumos en el mismo día
                let currentDate = col0;
                if (currentDate === "") {
                    currentDate = lastValidDate;
                } else {
                    if (currentDate.includes('/')) {
                        const parts = currentDate.split('/');
                        if (parts.length === 3) {
                            currentDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        }
                    }
                    lastValidDate = currentDate;
                }

                const cuotas = String(row[2] || '').trim();
                const pesos = parseMonto(row[4]);
                const dolares = parseMonto(row[5]);
                
                const isPesos = (pesos !== 0 || (pesos === 0 && dolares === 0));
                const montoRaw = isPesos ? pesos : dolares;
                const montoAbsoluto = Math.abs(montoRaw);
                const moneda = isPesos ? 'ARS' : 'USD';
                const esPendiente = descripcion.toLowerCase().includes('pendiente');

                // Detección automática de duplicados ya cargados en la base de datos
                const isDuplicate = state.globalTransData.some(t => {
                    return t.fecha === currentDate && 
                           t.cuenta === selectedAccount && 
                           t.moneda === moneda &&
                           Math.abs(parseFloat(t.monto) - montoAbsoluto) < 1.0;
                });

                let memoFinal = descripcion.replace(/\s+/g, ' ').trim();
                if (cuotas && !memoFinal.includes(cuotas)) memoFinal += ` (${cuotas})`;

                consumos.push({
                    id_temp: `imp_${Date.now()}_${i}`,
                    fecha: currentDate,
                    monto: montoAbsoluto,
                    moneda: moneda,
                    descripcion: memoFinal,
                    categoria: predictCategory(descripcion),
                    esPendiente: esPendiente,
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
