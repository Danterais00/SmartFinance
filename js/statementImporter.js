import { state, getLocalDateString } from './state.js';

// Mapeo inteligente contra las categorías reales del usuario
export function matchUserCategory(desc, userCategories) {
    if (!desc || !userCategories || userCategories.length === 0) return userCategories?.[0] || 'Varios';
    
    const d = desc.toLowerCase();
    
    // 1. Coincidencia directa con nombres de tus categorías
    for (let cat of userCategories) {
        if (cat.length >= 3 && d.includes(cat.toLowerCase())) {
            return cat;
        }
    }
    
    // 2. Diccionario de conceptos a categorías maestras comunes
    const rules = [
        { keywords: ['telepeaje', 'corresur', 'autopista', 'ausol', 'aubasa', 'camino', 'peaje'], targets: ['peaje', 'transporte', 'auto', 'vehiculo'] },
        { keywords: ['movistar', 'claro', 'personal', 'telecentro', 'fibertel', 'internet'], targets: ['telefono', 'telefonia', 'comunicacion', 'servicios', 'internet'] },
        { keywords: ['caja.*seguro', 'lacaja', 'seguro', 'sancor', 'mercantil'], targets: ['seguro', 'auto'] },
        { keywords: ['mcdonald', 'burger', 'mostaza', 'starbucks', 'cafe', 'parrill', 'restaurante', 'heladeria', 'homeroparrill'], targets: ['salidas', 'gastronomia', 'comida', 'restaurante'] },
        { keywords: ['apple', 'google', 'netflix', 'spotify', 'prime', 'disney', 'max', 'youtube'], targets: ['apple', 'suscripcion', 'streaming', 'servicios'] },
        { keywords: ['farmacity', 'farmacia', 'osde', 'swiss'], targets: ['salud', 'farmacia', 'medicina'] },
        { keywords: ['coto', 'carrefour', 'jumbo', 'disco', 'vea', 'dia%'], targets: ['supermercado', 'super', 'alimentos'] },
        { keywords: ['ypf', 'shell', 'axion', 'puma', 'combustible'], targets: ['nafta', 'combustible', 'auto'] },
        { keywords: ['dash', 'sport', 'nike', 'adidas', 'indumentaria', 'ropa', 'zapat'], targets: ['indumentaria', 'ropa', 'deporte'] },
        { keywords: ['pbkids', 'brinquedos', 'juguete'], targets: ['juguete', 'niño', 'hijos'] },
        { keywords: ['beleza', 'perfum', 'cosmet'], targets: ['cuidado', 'belleza', 'farmacia'] },
        { keywords: ['prosegur', 'alarma'], targets: ['seguridad', 'hogar', 'servicios'] },
        { keywords: ['merpago', 'mercado.*pago'], targets: ['mercado pago', 'varios', 'gastos varios'] }
    ];
    
    for (let r of rules) {
        if (r.keywords.some(k => new RegExp(k, 'i').test(d))) {
            for (let t of r.targets) {
                const found = userCategories.find(c => c.toLowerCase().includes(t));
                if (found) return found;
            }
        }
    }
    
    // 3. Fallback: categoría genérica o la primera disponible
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

export function parseVisaStatement(excelFileBuffer, selectedAccount, userCategories = []) {
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
            let foundTitularSection = false;
            let tableStarted = false;

            for (let i = 0; i < rawData.length; i++) {
                // REGLA ESTRICTA: Las filas 1 a 19 (índices 0 a 18) quedan 100% excluidas
                if (i < 19) {
                    continue;
                }

                const row = rawData[i];
                if (!row || row.length < 5) continue;

                const col0 = String(row[0] || '').trim();
                const col1 = String(row[1] || '').trim();

                // Identificar el bloque de consumos del titular (Fila 20 en adelante)
                if (col0.toLowerCase().includes('tarjeta de') && col0.toLowerCase().includes('terminada en')) {
                    foundTitularSection = true;
                    continue;
                }

                if (!foundTitularSection) continue;

                // Detectar cabecera real de los consumos del titular
                if (col0.toLowerCase() === 'fecha' && col1.toLowerCase().includes('descrip')) {
                    tableStarted = true;
                    continue;
                }

                if (!tableStarted) continue;

                // Frenar al llegar al subtotal de la tarjeta
                if (col0.toLowerCase().startsWith('subtotal') || (col0 === '' && col1 === '')) {
                    break;
                }

                const descripcion = col1;
                // Exclusión de seguridad por si apareciera un pago o crédito
                if (/su pago en|pago por|cr\.rg 5617/i.test(descripcion)) {
                    continue;
                }

                // Forward-fill: Asignar fecha previa cuando el banco agrupa compras del mismo día
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

                // Detección de consumos duplicados en el historial
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
                    categoria: matchUserCategory(descripcion, userCategories),
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
