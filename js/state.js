/**
 * SmartFinance - Módulo de Estado Global, Catálogos Maestros y Cola Offline
 * Versión: v8.1
 */

const OFFLINE_STORAGE_KEY = 'sf_offline_queue';

export const CATEGORIAS_DEFAULT = [
    'Aguas', 'Ajuste Técnico Saldos', 'Apple',
    'Arreglos del Hogar', 'Asesoría Financiera', 'CAFAR',
    'Carnicería', 'Cerámica', 'Compra/Venta Divisas',
    'Contadora', 'Corte Cesped', 'Danza Desi',
    'Edenor Pilar', 'Ekisian', 'Entretenimiento',
    'Farmacia', 'Gastos Automotor', 'Gimnasia',
    'Google Drive', 'Impuesto municipal Pilar', 'Impuestos cuentas bancarias',
    'Impuestos y Sellos', 'Ingresos Laborales / Honorarios', 'Insumos Piscina',
    'Intereses Financieros', 'La Caja Seguros', 'Limpieza Hogar',
    'Movistar', 'Nafta', 'Naturgy',
    'Netflix', 'Ofrenda', 'Otros Gastos (Sin Categorizar)',
    'Paddle', 'Pago Tarjeta de Crédito', 'Panadería',
    'Peajes', 'Peluquería', 'Personal Flow',
    'Personal TV', 'Prosegur', 'Regalos',
    'Rendimiento Inversiones', 'Restaurantes', 'Servicios Bancarios',
    'Supermercado', 'Tarjeta de Crédito Galicia', 'Tarjeta de Crédito Mercado Pago',
    'Tarjeta de Crédito Santander', 'Tenis', 'Tintorería',
    'Transferencia Interna', 'Verdulería', 'Wellspring'
];

export const CUENTAS_OPERATIVAS = [
    'Santander',
    'Efectivo',
    'Mercado Pago Dante',
    'Mercado Pago Lore',
    'Galicia'
];

export const CUENTAS_COMITENTES = [
    'Inviu',
    'Balanz',
    'Bull Market Brokers'
];

export const CUENTAS_TARJETAS = [
    'Tarjeta de Crédito Galicia',
    'Tarjeta de Crédito Santander',
    'Tarjeta de Crédito Mercado Pago'
];

export const CUENTAS_SISTEMA_TOTAL = Array.from(
    new Set([...CUENTAS_OPERATIVAS, ...CUENTAS_COMITENTES, ...CUENTAS_TARJETAS])
);

export const MESES_ES = Array.from({ length: 12 }, (_, idx) => {
    const label = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date(2026, idx, 1));
    return label.charAt(0).toUpperCase() + label.slice(1);
});

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
    editingTransactionId: null,
    selectedCategoryHistoryName: null,
    selectedCategoryHistoryRange: 6
};

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * Escapa caracteres especiales HTML para prevenir inyección XSS en el DOM.
 */
export function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/**
 * Devuelve la fecha local actual en formato ISO (YYYY-MM-DD).
 */
export function getLocalDateString() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calcula el período mensual anterior (YYYY-MM) a partir de uno dado.
 */
export function getPreviousMonthStr(currentPeriodo) {
    if (!currentPeriodo) return getLocalDateString().slice(0, 7);
    const [rawYear, rawMonth] = currentPeriodo.split('-').map(Number);
    const prevMonth = rawMonth === 1 ? 12 : rawMonth - 1;
    const prevYear = rawMonth === 1 ? rawYear - 1 : rawYear;
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/**
 * Persiste operaciones pendientes en localStorage cuando no hay conexión.
 */
export function saveOfflineQueue(batch) {
    try {
        const existing = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]');
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify([...existing, ...batch]));
    } catch (err) {
        console.error('No se pudo almacenar la cola offline:', err);
    }
}

/**
 * Sincroniza hacia Supabase los movimientos encolados localmente al recuperar red.
 */
export async function syncOfflineQueue(onSuccess) {
    if (!navigator.onLine) return;
    try {
        const raw = localStorage.getItem(OFFLINE_STORAGE_KEY);
        if (!raw) return;
        const pendingBatch = JSON.parse(raw);
        if (!Array.isArray(pendingBatch) || pendingBatch.length === 0) return;

        const { _supabase } = await import('./supabaseClient.js?v=8.1');
        const { error } = await _supabase.from('transacciones').insert(pendingBatch);
        if (!error) {
            localStorage.removeItem(OFFLINE_STORAGE_KEY);
            if (typeof onSuccess === 'function') onSuccess();
        }
    } catch (err) {
        console.error('Error al sincronizar operaciones offline:', err);
    }
}

/**
 * Combina las categorías maestras con las personalizadas del usuario en Supabase.
 */
export async function fetchDynamicCategories() {
    try {
        let merged = [...CATEGORIAS_DEFAULT];
        if (state.currentUser) {
            const { _supabase } = await import('./supabaseClient.js?v=8.1');
            const { data, error } = await _supabase
                .from('user_categories')
                .select('nombre_categoria')
                .eq('user_id', state.currentUser.id);

            if (!error && Array.isArray(data)) {
                const userCats = data.map((row) => row.nombre_categoria);
                merged = Array.from(new Set([...merged, ...userCats]));
            }
        }
        merged.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        state.misCategoriasUnificadas = merged;
        return merged;
    } catch (err) {
        state.misCategoriasUnificadas = [...CATEGORIAS_DEFAULT];
        return state.misCategoriasUnificadas;
    }
}
