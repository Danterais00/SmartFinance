/**
 * AUDIT TRAIL Y CHANGELOG DE SMARTFINANCE
 * Registro cronológico de parches, refactors y auditorías de código.
 */

export const APP_CHANGELOG = [
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
