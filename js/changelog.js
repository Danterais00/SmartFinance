/**
 * AUDIT TRAIL Y CHANGELOG DE SMARTFINANCE
 * Registro cronológico de parches, refactors y auditorías de código.
 */

export const APP_CHANGELOG = [
    {
        version: "v7.7",
        fecha: "2026-11-12",
        tipo: "LÓGICA CONTABLE & AUDITORÍA (FASE 2)",
        color: "var(--blue)",
        icon: "fa-scale-balanced",
        archivos: ["index.html", "js/financeEngine.js", "js/app.js", "js/pdfReport.js", "sw.js", "js/changelog.js"],
        descripcion: "Remediación de hallazgos AUD-04 a AUD-09: corte patrimonial histórico exacto al cierre del mes seleccionado; cálculo y persistencia de cotización implícita real en operaciones de divisas; paridad 1:1 del Reporte PDF con los ingresos, gastos totales y ahorro real del dashboard; selector opcional de devengamiento mensual para ingresos y sueldos; refinamiento del detector de duplicados por moneda y descripción, y sincronización completa de glosas en asientos espejo."
    },
    {
        version: "v7.6",
        fecha: "2026-11-12",
        tipo: "SEGURIDAD & BLINDAJE CONTABLE (FASE 1)",
        color: "var(--danger)",
        icon: "fa-shield-halved",
        archivos: ["js/state.js", "js/financeEngine.js", "js/app.js", "js/charts.js", "index.html", "sw.js"],
        descripcion: "Remediación de hallazgos críticos AUD-01, AUD-02 y AUD-03: sanitización HTML (escapeHTML) y delegación segura de eventos para eliminar riesgos XSS; incorporación de 'Servicios Bancarios' al catálogo maestro, normalización de ingresos bajo 'Ingresos Laborales / Honorarios' y preservación de categorías legadas al editar; bloqueos estrictos contra transferencias circulares (origen = destino), montos nulos/negativos y divisas sin importe recibido."
    },
    {
        version: "v7.5",
        fecha: "2026-11-11",
        tipo: "FEATURE CONTROL PRESUPUESTARIO & UX",
        color: "var(--primary)",
        icon: "fa-list-check",
        archivos: ["index.html", "css/styles.css", "js/app.js", "sw.js", "js/changelog.js"],
        descripcion: "Incorporación del Banner de Ejecución Presupuestaria Global con barra de progreso semaforizada y KPIs ejecutivos (Presupuesto Total, Gasto Computado y Disponible/Exceso Global). Adición de la columna 'Disponible / Desvío' y mini-barras de progreso por fila en el Semáforo Presupuestario RAG."
    },
    {
        version: "v7.4",
        fecha: "2026-11-11",
        tipo: "REFINAMIENTO VISUAL & ALINEACIÓN UX",
        color: "var(--primary)",
        icon: "fa-table-columns",
        archivos: ["js/app.js", "js/charts.js", "css/styles.css", "index.html", "sw.js"],
        descripcion: "Corrección de salto de línea en importes del Historial de Movimientos forzando nowrap mono-línea. Reestructuración de la lista de liquidez bancaria: alineación vertical perfecta de todos los importes en pesos hacia el margen derecho y reubicación del saldo en dólares debajo del importe en pesos."
    },
    {
        version: "v7.3",
        fecha: "2026-11-10",
        tipo: "REFINAMIENTO VISUAL & MACRO DASHBOARD",
        color: "var(--primary)",
        icon: "fa-money-bill-transfer",
        archivos: ["js/supabaseClient.js", "css/styles.css", "index.html", "sw.js"],
        descripcion: "Rediseño y jerarquización visual de las tarjetas de divisas (Dólar Oficial, Blue y MEP). Reubicación de la variación porcentual en badges semánticos independientes (.var-badge) en la cabecera, eliminando la duplicación del texto '= 0.0%' y logrando una lectura limpia y alineada de los precios de compra y venta en armonía con las tarjetas de Riesgo País e Inflación."
    },
    {
        version: "v7.2",
        fecha: "2026-11-09",
        tipo: "FEATURE ANALÍTICA & UX",
        color: "var(--primary)",
        icon: "fa-chart-simple",
        archivos: ["index.html", "css/styles.css", "js/charts.js", "js/app.js", "js/state.js", "sw.js"],
        descripcion: "Nuevo Gráfico Híbrido (Combo Chart) de 'Evolución Histórica por Categoría' con barras semaforizadas RAG y línea meta punteada. Incorporación de selector de categoría maestra, filtros de rango temporal interactivos (3M / 6M / 12M) y tarjeta de Micro-KPIs con métricas de gasto acumulado, promedio mensual y tasa de cumplimiento presupuestario."
    },
    {
        version: "v7.1",
        fecha: "2026-11-07",
        tipo: "UX/UI & ARQUITECTURA VISUAL",
        color: "var(--blue)",
        icon: "fa-chart-line",
        archivos: ["index.html", "js/app.js", "sw.js", "js/changelog.js"],
        descripcion: "Encapsulamiento estricto de los gráficos 'Desempeño por Categoría' y 'Evolución Histórica Multimensual' dentro de la subvista exclusiva 'Gráficos Analíticos' (#subview-graficos). Eliminación de la duplicación visual y sobrecarga de scroll en 'Presupuestos & RAG', optimizando la captura táctil y el rendimiento de renderizado en dispositivos móviles."
    },
    {
        version: "v7.0",
        fecha: "2026-11-07",
        tipo: "PARSER & INTEGRIDAD DE EXTRACTOS",
        color: "var(--primary)",
        icon: "fa-file-excel",
        archivos: ["js/statementImporter.js", "js/changelog.js"],
        descripcion: "Soporte multi-plástico para resúmenes bancarios Visa/Mastercard (renovaciones por vencimiento/extravío y adicionales). Eliminación del corte prematuro en subtotales parciales, permitiendo conciliar el 100% del saldo consumido ($1.659.470,05) y recuperando compras en cuotas históricas. Enriquecimiento del motor predictivo con términos médicos, ópticos y de salud."
    },
    {
        version: "v6.9",
        fecha: "2026-11-03",
        tipo: "INTEGRIDAD CONTABLE & AUDITORÍA",
        color: "var(--blue)",
        icon: "fa-scale-balanced",
        archivos: ["js/app.js", "js/state.js", "js/financeEngine.js"],
        descripcion: "Preservación y recalibración dinámica de tipo de cambio al conmutar monedas en el historial. Reactividad inmediata y recarga de métricas tras reconexión offline. Incorporación de 'Impuestos y Sellos' e 'Intereses Financieros' al catálogo maestro y activación del control de pasivos exigibles de tarjetas en la auditoría pre-flight."
    },
    {
        version: "v6.8",
        fecha: "2026-11-02",
        tipo: "HOTFIX LÓGICA & ESTADO",
        color: "var(--danger)",
        icon: "fa-shield-halved",
        archivos: ["js/app.js", "index.html"],
        descripcion: "Conciliación estricta de pagos para tarjetas de crédito (eliminando coincidencias parciales con cuentas bancarias homónimas y falsos positivos por deuda cero). Sincronización de estado único para compromisos pagados entre Notificaciones y Tabla RAG. Guardarraíl temporal automático en fechas de vencimiento."
    },
    {
        version: "v6.7",
        fecha: "2026-10-29",
        tipo: "RESTITUCIÓN",
        color: "var(--primary)",
        icon: "fa-calendar-check",
        archivos: ["index.html", "js/app.js"],
        descripcion: "Reincorporación del campo 'Fecha de Vencimiento' en el modal de edición de presupuestos. Restitución de la campana de alerta y estado [Pagado] en la tabla de control presupuestario."
    },
    {
        version: "v6.6",
        fecha: "2026-10-29",
        tipo: "AJUSTE VISUAL",
        color: "var(--primary)",
        icon: "fa-money-bill-wave",
        archivos: ["js/charts.js", "js/app.js"],
        descripcion: "Desacoplamiento bimonetario en Distribución de Liquidez y métricas: la cifra principal refleja exclusivamente saldo en pesos (ARS) y la tenencia en dólares (USD) se muestra separada sin sumarse al importe en pesos."
    },
    {
        version: "v6.5",
        fecha: "2026-10-28",
        tipo: "CORRECCIÓN CRÍTICA",
        color: "var(--danger)",
        icon: "fa-triangle-exclamation",
        archivos: ["js/financeEngine.js"],
        descripcion: "Restitución de sintaxis nativa UUID RFC 4122 en transfer_group_id. Resuelve el rechazo de inserción en PostgreSQL para transferencias y divisas."
    },
    {
        version: "v6.4",
        fecha: "2026-10-28",
        tipo: "ARQUITECTURA",
        color: "var(--blue)",
        icon: "fa-timeline",
        archivos: ["js/changelog.js", "index.html", "js/app.js"],
        descripcion: "Incorporación del Audit Trail / Changelog visual en la pestaña Ajustes con diseño y paleta integrada."
    },
    {
        version: "v6.3",
        fecha: "2026-10-28",
        tipo: "CORRECCIÓN", 
        color: "var(--warning)", 
        icon: "fa-bug",
        archivos: ["js/charts.js", "js/state.js", "js/app.js"],
        descripcion: "Orden alfabético A-Z forzado en el Gráfico de Categorías. Reactivación del plugin de zoom con la rueda del ratón (eje Y) desacoplado."
    },
    {
        version: "v6.0",
        fecha: "2026-10-28",
        tipo: "ARQUITECTURA",
        color: "var(--blue)",
        icon: "fa-sitemap",
        archivos: ["js/charts.js", "js/state.js"],
        descripcion: "Eliminación de la cuenta de prueba (IOL Invertir Online). Restitución de la lista oficial de cuentas comitentes de forma inmutable."
    },
    {
        version: "v5.8",
        fecha: "2026-10-27",
        tipo: "SEGURIDAD",
        color: "var(--danger)",
        icon: "fa-shield-halved",
        archivos: ["js/app.js", "index.html"],
        descripcion: "Envolvimiento de promesas asíncronas en bloques try/catch. Corrección del error de inversión de signo al editar reintegros de tarjeta."
    }
];

export function renderChangelogTable() {
    const tbody = document.getElementById('changelog-table-body');
    if (!tbody) return;

    tbody.innerHTML = "";

    APP_CHANGELOG.forEach(log => {
        const fileTags = log.archivos.map(f => `<span style="display:inline-block; font-size:10.5px; background:var(--bg-main); border:1px solid var(--border-color); padding:3px 6px; border-radius:4px; color:var(--text-muted); margin:2px 2px 0 0;"><i class="fa-solid fa-file-code" style="font-size:10px; margin-right:3px;"></i>${f}</span>`).join('');

        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 700; color: #fff; font-family: 'Urbanist'; font-size: 14px;">
                    ${log.version}
                </td>
                <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap !important;">
                    ${log.fecha}
                </td>
                <td>
                    <span style="font-size: 10px; font-weight: 800; background: ${log.color}20; border: 1px solid ${log.color}50; color: ${log.color}; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; letter-spacing: 0.5px;">
                        <i class="fa-solid ${log.icon}"></i> ${log.tipo}
                    </span>
                </td>
                <td style="font-size: 12.5px; font-weight: 500; line-height: 1.5; color: #e5e7eb;">
                    ${log.descripcion}
                    <div style="margin-top: 6px;">${fileTags}</div>
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-sm" onclick="window.UI.showAppAlert('Trazabilidad Bloqueada', 'Para auditar la línea exacta de código fuente, revisá el historial de commits en tu repositorio de GitHub.')" style="background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-muted); white-space:nowrap; padding: 6px 12px;">
                        <i class="fa-brands fa-github"></i> Código
                    </button>
                </td>
            </tr>
        `;
    });
}
