/**
 * AUDIT TRAIL Y CHANGELOG DE SMARTFINANCE
 * Registro cronológico de parches, refactors y auditorías de código.
 */

export const APP_CHANGELOG = [
    {
        version: "v9.1",
        fecha: "2026-11-24",
        tipo: "ESPACIADO ENTRE GRÁFICOS ANALÍTICOS Y BLOQUES RAG",
        color: "var(--primary)",
        icon: "fa-grip-lines",
        archivos: ["sw.js", "index.html", "css/styles.css", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Incorporación del margen estándar de separación (8px) entre las tarjetas de gráficos dentro de Gráficos Analíticos y entre los grupos de naturaleza (Compromisos Fijos, Variables Esenciales y Variables Discrecionales) del Semáforo Presupuestario RAG, sin alterar cálculos ni demás vistas."
    },
    {
        version: "v9.0",
        fecha: "2026-11-24",
        tipo: "GRÁFICOS DESGLOSADOS POR NATURALEZA (BARRAS AGRUPADAS)",
        color: "var(--blue)",
        icon: "fa-chart-column",
        archivos: ["sw.js", "index.html", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Reemplazo del gráfico unificado de Desempeño por Categoría por tres gráficos independientes de barras agrupadas (Compromisos Fijos, Variables Esenciales y Variables Discrecionales) ordenados de mayor a menor Gasto Real, con controles individuales de escala (Lineal/Logarítmica) y zoom X/Y, aviso visual cuando un grupo no tiene categorías activas y réplica fiel en la Sección 3 del Reporte PDF."
    },
    {
        version: "v8.9",
        fecha: "2026-11-23",
        tipo: "AUDITORÍA DE EXCESOS POR NATURALEZA EN PDF",
        color: "var(--primary)",
        icon: "fa-file-pdf",
        archivos: ["sw.js", "index.html", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Ampliación de la Sección 4 (Resumen Ejecutivo Global y Desvíos) en el Reporte PDF auditado: incorporación del desglose estructurado por naturaleza del gasto (Compromisos Fijos, Variables Esenciales y Variables Discrecionales) listando las categorías en estado 'Fuera' ordenadas de mayor a menor exceso con el detalle cronológico de todos sus gastos del mes (Fecha, Concepto y Monto) o la leyenda 'Sin categorías en estado Fuera'."
    },
    {
        version: "v8.8",
        fecha: "2026-11-23",
        tipo: "SINCRONIZACIÓN MODULAR & GRÁFICOS ANALÍTICOS",
        color: "var(--primary)",
        icon: "fa-chart-line",
        archivos: ["sw.js", "index.html", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Unificación de etiquetas de importación (?v=8.8) en los 8 módulos JavaScript para compartir una única instancia de estado en memoria (eliminando la pantalla vacía y valores en $0 en Gráficos Analíticos) y renderizado diferido con requestAnimationFrame al abrir la subpestaña de gráficos."
    },
    {
        version: "v8.7",
        fecha: "2026-11-20",
        tipo: "DETALLE RÁPIDO EN SEMÁFORO RAG",
        color: "var(--blue)",
        icon: "fa-list-ul",
        archivos: ["sw.js", "index.html", "css/styles.css", "js/app.js", "js/changelog.js"],
        descripcion: "Incorporación de cuadro flotante contextual en el Semáforo Presupuestario RAG: al posicionar el cursor (o tocar en móvil) sobre el nombre de una categoría o su Gasto Real, se despliega el listado de gastos imputados en el mes activo (Fecha, Concepto y Monto) excluyendo registros NO_COMPUTA y renovándose automáticamente al cambiar de período."
    },
    {
        version: "v8.6",
        fecha: "2026-11-19",
        tipo: "HOTFIX PAGINACIÓN HISTÓRICA SUPABASE",
        color: "var(--primary)",
        icon: "fa-database",
        archivos: ["sw.js", "index.html", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Implementación de descarga paginada automática en bloques de 1.000 filas (fetchAllPaginatedRows con desempate determinístico por fecha e id) para transacciones y presupuestos históricos, superando el límite por defecto de 1.000 registros por consulta de Supabase y restaurando el 100% de los saldos acumulados de apertura."
    },
    {
        version: "v8.5",
        fecha: "2026-11-17",
        tipo: "SEMÁFORO RAG POR NATURALEZA & RIGIDEZ",
        color: "var(--primary)",
        icon: "fa-layer-group",
        archivos: ["sw.js", "index.html", "css/styles.css", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Clasificación inteligente y configurable del Semáforo Presupuestario RAG por naturaleza del gasto (Compromisos Fijos, Variables Esenciales y Variables Discrecionales) persistida en Supabase: 1) Selector de vista rápida en cabecera RAG (Por Naturaleza, Por Semáforo, Alfabético A–Z) con subtotales y barras de ejecución por bloque; 2) Selector de naturaleza en Fijar Presupuesto Mensual, Modal de Edición y Duplicar Mes Anterior; y 3) Exportación agrupada en Reporte PDF con indicador de Rigidez Presupuestaria."
    },
    {
        version: "v8.4",
        fecha: "2026-11-16",
        tipo: "REDISEÑO UX/UI DASHBOARD INICIO",
        color: "var(--blue)",
        icon: "fa-layer-group",
        archivos: ["sw.js", "index.html", "css/styles.css", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Rediseño integral de la pantalla de Inicio: 1) Transformación de 'Mercado Macro & Divisas en Vivo' en marquesina continua (ticker) con Compra/Venta y pausa al interactuar; 2) Reordenamiento de las 5 tarjetas KPI principales (Ingresos Mes, Presupuesto Mes, Gastos Reales Mes, Ahorro Neto Mes y Patrimonio Neto) y eliminación de la tarjeta redundante de Liquidez Inmediata; 3) Traslado de 'Ejecución Presupuestaria Global' desde Presupuestos & RAG hacia Inicio con barra de progreso y valores presupuestado/ejecutado/disponible; y 4) Compactación de 'Distribución de Liquidez Operativa' incorporando el saldo líquido en USD debajo del total en ARS dentro del centro del gráfico Donut."
    },
    {
        version: "v8.3",
        fecha: "2026-11-16",
        tipo: "AUDITORÍA INTEGRAL & BLINDAJE QA",
        color: "var(--primary)",
        icon: "fa-shield-halved",
        archivos: ["sw.js", "index.html", "js/app.js", "js/changelog.js", "js/charts.js", "js/financeEngine.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Remediación holística de hallazgos AUD-10 a AUD-18: unificación definitiva de 'Impuestos cuentas bancarias' y 'Otros' en cierre manual de tarjetas y catálogo; corrección de variable de desvío en Reporte PDF (v8.3); evaluación bimonetaria neta de deuda en tarjetas; paridad entre centro del gráfico Donut y tarjeta Liquidez Inmediata; filtrado de filas en $0,00 y soporte de reintegros impositivos en importador Excel; actualización visual inmediata en modo offline; selector de exclusión presupuestaria al editar gastos; y mejoras de accesibilidad y respaldo macro."
    },
    {
        version: "v8.2",
        fecha: "2026-11-16",
        tipo: "HOLISTIC MASTER RELEASE",
        color: "var(--primary)",
        icon: "fa-rocket",
        archivos: ["js/changelog.js", "sw.js", "index.html", "js/app.js", "js/pdfReport.js", "js/state.js", "js/statementImporter.js", "js/supabaseClient.js"],
        descripcion: "Consolidación holística de la arquitectura: 1) Reincorporación de los Gráficos de Alta Resolución y el 'Resumen Ejecutivo Global' (Excesos y Ajustes) en el Reporte PDF mediante canvas offscreen; 2) Limpieza del catálogo de categorías (unificación de 'Impuestos y Sellos' a 'Impuestos cuentas bancarias' y consolidación de 'Otros'); 3) Sincronización del módulo Supabase para obtener Inflación y Riesgo País de la API real de ArgentinaDatos sin hardcodeos; y 4) Unificación final de caché PWA bajo etiqueta v8.2."
    },
    {
        version: "v8.1",
        fecha: "2026-11-15",
        tipo: "HOTFIX & PARIDAD PDF",
        color: "var(--primary)",
        icon: "fa-file-pdf",
        archivos: ["js/pdfReport.js", "sw.js", "js/app.js", "js/charts.js", "js/financeEngine.js", "js/state.js", "js/statementImporter.js", "index.html"],
        descripcion: "Sincronización unificada de módulos (?v=8.1) para eliminar el volcado en cero ($0) de activos, patrimonio e ingresos en el Reporte PDF. Colores dinámicos (rojo/gris/verde) para cifras deficitarias y pasivos, incorporación de la fila de Compromisos y Vencimientos en el Dictamen Pre-Flight, paridad con Presupuesto Planificado y pie de página con cotización Dólar MEP aplicada."
    },
    {
        version: "v8.0",
        fecha: "2026-11-13",
        tipo: "REFACTOR FINAL & AUDITORÍA QA",
        color: "var(--primary)",
        icon: "fa-check-double",
        archivos: ["js/statementImporter.js", "sw.js", "js/state.js", "js/app.js", "js/charts.js", "index.html"],
        descripcion: "Consolidación matemática final y QA funcional: soporte integrado para plásticos adicionales y cierres de impuestos, deduplicación estricta de percepciones, eliminación de falsos positivos en alertas de pago parcial, corte de meses futuros vacíos en RAG, y conexión del chat de Soporte AI con el estado patrimonial y deuda en vivo del usuario."
    },
    {
        version: "v7.8",
        fecha: "2026-11-12",
        tipo: "REVISIÓN INTEGRAL & REFACTOR FINAL (FASE 3)",
        color: "var(--blue)",
        icon: "fa-check-double",
        archivos: ["js/statementImporter.js", "sw.js", "js/state.js", "js/app.js", "js/charts.js", "index.html"],
        descripcion: "Soporte para múltiples plásticos (titulares y adicionales) en importador de extractos y captura de cargos impositivos de cierre (Otros Conceptos). Eliminación de la cuenta Mercado Pago de las métricas comitentes para evitar duplicación de liquidez. Precaching aislado tolerante a fallos para CDN en Service Worker y control estricto de edición de categorías en asientos vinculados."
    },
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
