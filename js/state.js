// Categorías originales
export const CATEGORIAS_DEFAULT = [
    'Supermercado',
    'Wellspring',
    'Arreglos del Hogar',
    'Tarjeta de Crédito Galicia',
    'Corte Cesped',
    'Limpieza Hogar',
    'Verdulería',
    'CAFAR',
    'Farmacia',
    'La Caja Seguros',
    'Edenor Pilar',
    'Naturgy',
    'Nafta',
    'Restaurantes',
    'Ofrenda',
    'Prosegur',
    'Tintorería',
    'Cerámica',
    'Entretenimiento',
    'Gastos Automotor',
    'Impuestos cuentas bancarias',
    'Peajes',
    'Contadora',
    'Peluquería',
    'Ekisian',
    'Tarjeta de Crédito Santander',
    'Insumos Piscina',
    'Regalos',
    'Danza Desi',
    'Tenis',
    'Paddle',
    'Personal Flow',
    'Asesoría Financiera',
    'Personal TV',
    'Aguas',
    'Gimnasia',
    'Movistar',
    'Panadería',
    'Impuesto municipal Pilar',
    'Netflix',
    'Apple',
    'Google Drive',
    'Rendimiento Inversiones',
    'Ingresos Laborales / Honorarios',
    'Transferencia Interna',
    'Compra/Venta Divisas',
    'Pago Tarjeta de Crédito',
    'Ajuste Técnico Saldos',
    'Otros Gastos (Sin Categorizar)'
];

// LISTAS OFICIALES Y DEFINITIVAS DE CUENTAS
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
        state.misCategoriasUnificadas = combined;
        return combined;
    } catch (e) {
        state.misCategoriasUnificadas = [...CATEGORIAS_DEFAULT];
        return state.misCategoriasUnificadas;
    }
}
