export function render(mount) {
  mount.innerHTML = `
    <div class="panel">
      <h2>Archivo</h2>
      <div class="empty-state" style="margin-top:14px;">
        Este módulo todavía no está definido. Cuéntame qué debe guardar aquí
        — ¿fotos de campo, facturas y soportes, certificados, contratos? —
        y lo construimos con el mismo criterio de relacionarlo con lotes y labores.
      </div>
    </div>
  `;
}
