import { _supabase } from './supabaseClient.js';

export const CUENTAS_OPERATIVAS = ["Santander", "Efectivo", "Mercado Pago Dante", "Mercado Pago Lore", "Galicia"];
export const CUENTAS_COMITENTES = ["Inviu", "Balanz", "Bull Market Brokers", "Mercado Pago Dante", "Mercado Pago Lore"];
export const CUENTAS_SISTEMA_TOTAL = [...new Set([...CUENTAS_OPERATIVAS, ...CUENTAS_COMITENTES])];

export const CATEGORIAS_RESPALDO_SEED = [
    "ARBA Automotor", "ARBA Inmobiliario Pilar", "Aguas", "Ajuste Técnico Saldos", "Apple", "CAFAR", "Carnicería",
    "Cementerio Parque", "Contadora", "Corte Cesped", "Danza Desi", "Edenor Pilar", "Ekisian",
    "Entretenimiento", "Farmacia", "Federación Patronal Seguros Lore", "Google Drive",
    "IIBB Lore", "Impuesto municipal Pilar", "Impuestos cuentas bancarias", "Indumentaria/ Calzado",
    "Juguetes", "La Caja Seguros", "Librería / Papelera", "Limpieza Hogar", "Movistar",
    "Médicos / Pediatra", "Nafta", "Natación", "Naturgy", "Netflix", "Ofrenda", "Peajes",
    "Peluquería", "Personal Flow", "Personal TV", "Prosegur", "Restaurantes", "Supermercado",
    "Tarjeta de Crédito Galicia", "Tarjeta de Crédito Mercado Pago", "Tarjeta de Crédito Santander",
    "Tenis", "Verdulería", "Wellspring", "Leña", "Asesoría Financiera"
];

export const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export const state = {
    currentUser: null,
    globalTransData: [],
    globalBudgetData: [],
    allBudgetDataHistorico: [],
    currentFilteredData: [],
    currentAccountBalancesARS: {},
    currentAccountBalancesUSD: {},
    brokerEarningsARS: {},
    brokerEarningsUSD: {},
    misCategoriasUnificadas: [...CATEGORIAS_RESPALDO_SEED],
    currentMonthAlertsCache: [],
    cachedAuditResult: null,
    editingTransactionId: null
};

export function getLocalDateString() {
    const now = new Date();
    return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().substring(0, 10);
}

export function getPreviousMonthStr(periodoStr) {
    if (!periodoStr || !periodoStr.includes('-')) return getLocalDateString().substring(0, 7);
    const [year, month] = periodoStr.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

export function saveOfflineQueue(batch) {
    const queue = JSON.parse(localStorage.getItem('sf_offline_queue') || '[]');
    queue.push(...batch);
    localStorage.setItem('sf_offline_queue', JSON.stringify(queue));
}

export async function syncOfflineQueue(onSuccess) {
    if (!navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem('sf_offline_queue') || '[]');
    if (queue.length === 0) return;

    let pending = [];
    for (let item of queue) {
        const { error } = await _supabase.from('transacciones').insert([item]);
        if (error) pending.push(item);
    }

    localStorage.setItem('sf_offline_queue', JSON.stringify(pending));
    if (pending.length === 0 && onSuccess) {
        onSuccess();
    }
}

export async function fetchDynamicCategories() {
    if (!state.currentUser) return;
    try {
        let { data: cats, error } = await _supabase.from('user_categories').select('*').order('nombre_categoria', { ascending: true });
        if (error) throw error;

        if (!cats || cats.length === 0) {
            state.misCategoriasUnificadas = [...CATEGORIAS_RESPALDO_SEED];
        } else {
            state.misCategoriasUnificadas = cats.map(c => c.nombre_categoria);
        }
    } catch (err) {
        console.error("Error cargando categorías maestras:", err);
        state.misCategoriasUnificadas = [...CATEGORIAS_RESPALDO_SEED];
    }
}
