// Categorías por defecto en orden alfabético
export const CATEGORIAS_DEFAULT = [
    'Aguas',
    'Ajuste Técnico Saldos',
    'Apple',
    'Arreglos del Hogar',
    'Asesoría Financiera',
    'CAFAR',
    'Carnicería',
    'Cerámica',
    'Compra/Venta Divisas',
    'Contadora',
    'Corte Cesped',
    'Danza Desi',
    'Edenor Pilar',
    'Ekisian',
    'Entretenimiento',
    'Farmacia',
    'Gastos Automotor',
    'Gimnasia',
    'Google Drive',
    'Impuesto municipal Pilar',
    'Impuestos cuentas bancarias',
    'Ingresos Laborales / Honorarios',
    'Insumos Piscina',
    'La Caja Seguros',
    'Limpieza Hogar',
    'Movistar',
    'Nafta',
    'Naturgy',
    'Netflix',
    'Ofrenda',
    'Otros Gastos (Sin Categorizar)',
    'Paddle',
    'Pago Tarjeta de Crédito',
    'Panadería',
    'Peajes',
    'Peluquería',
    'Personal Flow',
    'Personal TV',
    'Prosegur',
    'Regalos',
    'Rendimiento Inversiones',
    'Restaurantes',
    'Supermercado',
    'Tarjeta de Crédito Galicia',
    'Tarjeta de Crédito Santander',
    'Tenis',
    'Tintorería',
    'Transferencia Interna',
    'Verdulería',
    'Wellspring'
];

export const CUENTAS_OPERATIVAS = ["Santander", "Efectivo", "Mercado Pago Dante", "Mercado Pago Lore", "Galicia"];
export const CUENTAS_COMITENTES = ["Inviu", "Balanz", "Bull Market Brokers", "Mercado Pago Dante"];
export const CUENTAS_TARJETAS = ["Tarjeta de Crédito Galicia", "Tarjeta de Crédito Santander", "Tarjeta de Crédito Mercado Pago"];
export const CUENTAS_SISTEMA_TOTAL = [...new Set([...CUENTAS_OPERATIVAS, ...CUENTAS_COMITENTES, ...CUENTAS_TARJETAS])];
export const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export const state = {
    currentUser: null,
    globalTransData: [],
    globalBudgetData: [],
    allBudgetDataHistorico: [],
    misCategoriasUnificadas: [...CATEGORIAS_DEFAULT],
    cachedCategoriesDataForChart: [],
    cachedHistoricalDataForChart: [],
    cachedAuditResult: null,
    currentMonthAlertsCache: [],
    currentAccountBalancesARS: {},
    currentAccountBalancesUSD: {},
    brokerEarningsARS: {},
    brokerEarningsUSD: {},
    creditCardDebtARS: {},
    creditCardDebtUSD: {},
    editingTransactionId: null
};

export function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getPreviousMonthStr(currentPeriodo) {
    if (!currentPeriodo) return getLocalDateString().substring(0, 7);
    const parts = currentPeriodo.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    if (month === 0) {
        month = 12;
        year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
}

export function saveOfflineQueue(batch) {
    try {
        const queue = JSON.parse(localStorage.getItem('sf_offline_queue') || '[]');
        const updated = queue.concat(batch);
        localStorage.setItem('sf_offline_queue', JSON.stringify(updated));
    } catch (e) {
        console.error('Error al guardar cola offline:', e);
    }
}

export async function syncOfflineQueue(onSuccess) {
    if (!navigator.onLine) return;
    try {
        const raw = localStorage.getItem('sf_offline_queue');
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (!Array.isArray(queue) || queue.length === 0) return;

        const { _supabase } = await import('./supabaseClient.js');
        const { error } = await _supabase.from('transacciones').insert(queue);
        if (!error) {
            localStorage.removeItem('sf_offline_queue');
            if (onSuccess) onSuccess();
        }
    } catch (e) {
        console.error('Error al sincronizar cola offline:', e);
    }
}

export async function fetchDynamicCategories() {
    try {
        let combined = [...CATEGORIAS_DEFAULT];
        if (state.currentUser) {
            const { _supabase } = await import('./supabaseClient.js');
            const { data, error } = await _supabase
                .from('user_categories')
                .select('nombre_categoria')
                .eq('user_id', state.currentUser.id);

            if (!error && data) {
                const customNames = data.map(d => d.nombre_categoria);
                combined = [...new Set([...combined, ...customNames])];
            }
        }
        combined.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        state.misCategoriasUnificadas = combined;
        return combined;
    } catch (e) {
        state.misCategoriasUnificadas = [...CATEGORIAS_DEFAULT];
        return state.misCategoriasUnificadas;
    }
}
