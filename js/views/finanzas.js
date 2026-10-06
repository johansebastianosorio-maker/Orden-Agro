import * as store from '../store.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { formatCOP, formatFecha, hoyISO, escapeHtml } from '../format.js';

const TIPOS = ['ingreso', 'costo', 'gasto', 'impuesto', 'interes'];
const TIPO_LABEL = { ingreso: 'Ingreso', costo: 'Costo', gasto: 'Gasto', impuesto: 'Impuesto', interes: 'Interés' };
const TIPO_TAG = { ingreso: 'tag-brand', costo: 'tag-soil', gasto: 'tag-soil', impuesto: 'tag-finance', interes: 'tag-finance' };

let filtroTipo = 'todos';
let filtroLote = 'todos';

export function render(mount, finca) {
  const lotes = store.listarLotes(finca.id);
  const movimientos = store.listarMovimientos(finca.id);
  
  // Cálculo de P&L (Estado de Resultados)
  let ingresos = 0, costosDirectos = 0, gastosAdmin = 0, impuestos = 0, intereses = 0;
  
  movimientos.forEach(m => {
    const monto = Number(m.monto);
    if (m.tipo === 'ingreso') ingresos += monto;
    else if (m.tipo === 'costo') costosDirectos += monto; // Costos operativos vinculados a labor/lote
    else if (m.tipo === 'gasto') gastosAdmin += monto;
    else if (m.tipo === 'impuesto') impuestos += monto;
    else if (m.tipo === 'interes') intereses += monto;
  });
  
  const utilidadBruta = ingresos - costosDirectos;
  const ebitda = utilidadBruta - gastosAdmin; // Utilidad Operativa
  const utilidadNeta = ebitda - impuestos - intereses;

  const pct = (valor, base) => base > 0 ? Math.round((valor / base) * 100) + '%' : '0%';

  mount.innerHTML = `
    <!-- ESTADO DE RESULTADOS (P&L) -->
    <div class="panel" style="margin-bottom: 24px; background: var(--surface);">
      <div class="panel-header" style="border-bottom: 1px solid var(--soil-light); padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: var(--brand-ink);">Estado de Resultados (P&L)</h2>
        <span class="tag tag-finance">Global de la finca</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; color: var(--brand);">
          <span>(+) Ingresos Operacionales</span>
          <span class="tabular font-bold">${formatCOP(ingresos)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1rem; color: var(--rust);">
          <span>(-) Costos Directos (Lotes / Labores)</span>
          <span class="tabular">− ${formatCOP(costosDirectos)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 600; border-top: 1px dashed var(--soil-light); padding-top: 8px; color: ${utilidadBruta >= 0 ? 'var(--brand-ink)' : 'var(--rust)'};">
          <span>(=) Utilidad Bruta</span>
          <span class="tabular">${formatCOP(utilidadBruta)} <span style="font-size:0.8rem; font-weight:400; color:var(--soil)">(${pct(utilidadBruta, ingresos)})</span></span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1rem; color: var(--soil-dark); margin-top: 8px;">
          <span>(-) Gastos Administrativos (Generales)</span>
          <span class="tabular">− ${formatCOP(gastosAdmin)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 600; border-top: 1px dashed var(--soil-light); padding-top: 8px; color: ${ebitda >= 0 ? 'var(--brand-ink)' : 'var(--rust)'};">
          <span>(=) Utilidad Operativa (EBITDA)</span>
          <span class="tabular">${formatCOP(ebitda)} <span style="font-size:0.8rem; font-weight:400; color:var(--soil)">(${pct(ebitda, ingresos)})</span></span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1rem; color: var(--finance); margin-top: 8px;">
          <span>(-) Impuestos e Intereses</span>
          <span class="tabular">− ${formatCOP(impuestos + intereses)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1.25rem; font-weight: 700; border-top: 2px solid var(--soil-light); padding-top: 8px; margin-top: 4px; color: ${utilidadNeta >= 0 ? 'var(--brand-ink)' : 'var(--rust)'};">
          <span>(=) Utilidad Neta (Margen)</span>
          <span class="tabular">${formatCOP(utilidadNeta)} <span style="font-size:0.9rem; font-weight:400; color:var(--soil)">(${pct(utilidadNeta, ingresos)})</span></span>
        </div>
      </div>
    </div>

    <!-- LIBRO MAYOR (Movimientos) -->
    <div class="panel">
      <div class="panel-header">
        <h2>Libro Mayor Financiero</h2>
        <button id="btn-nuevo-mov" class="btn btn-primary btn-small">Registrar movimiento</button>
      </div>
      <div class="form-row" style="margin-bottom:16px;">
        <label>Filtrar por tipo
          <select id="filtro-tipo">
            <option value="todos">Todos</option>
            ${TIPOS.map((t) => `<option value="${t}">${TIPO_LABEL[t]}</option>`).join('')}
          </select>
        </label>
        <label>Filtrar por lote
          <select id="filtro-lote">
            <option value="todos">Todos</option>
            <option value="general">General (sin lote)</option>
            ${lotes.map((l) => `<option value="${l.id}">${escapeHtml(l.nombre)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div id="tabla-mov"></div>
    </div>
  `;

  mount.querySelector('#btn-nuevo-mov').addEventListener('click', () => {
    formularioMovimiento(finca, () => render(mount, finca));
  });
  mount.querySelector('#filtro-tipo').addEventListener('change', (e) => { filtroTipo = e.target.value; pintarTabla(finca); });
  mount.querySelector('#filtro-lote').addEventListener('change', (e) => { filtroLote = e.target.value; pintarTabla(finca); });

  pintarTabla(finca);
}

function pintarTabla(finca) {
  const cont = document.getElementById('tabla-mov');
  if (!cont) return;
  const lotes = store.listarLotes(finca.id);
  const loteNombre = (id) => lotes.find((l) => l.id === id)?.nombre || 'General (sin lote)';

  let movimientos = store.listarMovimientos(finca.id);
  if (filtroTipo !== 'todos') movimientos = movimientos.filter((m) => m.tipo === filtroTipo);
  if (filtroLote === 'general') movimientos = movimientos.filter((m) => !m.lote_id);
  else if (filtroLote !== 'todos') movimientos = movimientos.filter((m) => m.lote_id === filtroLote);

  if (movimientos.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay movimientos con este filtro.</div>`;
    return;
  }

  cont.innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Lote</th><th class="num">Monto</th><th></th></tr></thead>
      <tbody>
        ${movimientos.map((m) => `
          <tr data-id="${m.id}">
            <td class="tabular">${formatFecha(m.fecha)}</td>
            <td><span class="tag ${TIPO_TAG[m.tipo]}">${TIPO_LABEL[m.tipo]}</span></td>
            <td>${escapeHtml(m.descripcion || m.categoria)} ${m.origen !== 'manual' ? '<span class="tag tag-muted">automático</span>' : ''}</td>
            <td>${escapeHtml(loteNombre(m.lote_id))}</td>
            <td class="num tabular">${m.tipo === 'ingreso' ? '+' : '−'} ${formatCOP(m.monto)}</td>
            <td class="row-actions">
              ${m.origen === 'manual' ? '<button class="icon-btn" data-accion="editar">Editar</button><button class="icon-btn danger" data-accion="eliminar">Eliminar</button>' : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  cont.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      if (confirm('¿Eliminar este movimiento?')) {
        store.eliminarMovimiento(id);
        mostrarToast('Movimiento eliminado');
        window.dispatchEvent(new Event('hashchange')); // Recarga toda la vista incluyendo P&L
      }
    });
  });
  cont.querySelectorAll('[data-accion="editar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const movimiento = movimientos.find((m) => m.id === btn.closest('tr').dataset.id);
      formularioMovimiento(finca, () => window.dispatchEvent(new Event('hashchange')), movimiento);
    });
  });
}

function formularioMovimiento(finca, onSave, editar = null) {
  const lotes = store.listarLotes(finca.id);
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Tipo
      <select name="tipo">${TIPOS.map((t) => `<option value="${t}" ${editar?.tipo === t ? 'selected' : ''}>${TIPO_LABEL[t]}</option>`).join('')}</select>
    </label>
    <label>Categoría
      <input name="categoria" value="${editar ? escapeHtml(editar.categoria) : ''}" placeholder="Ej. Venta de cosecha, Predial, Crédito Banco Agrario" />
    </label>
    <label>Descripción (opcional)
      <input name="descripcion" value="${editar ? escapeHtml(editar.descripcion) : ''}" placeholder="Detalle del movimiento" />
    </label>
    <div class="form-row">
      <label>Monto (COP)
        <input name="monto" type="number" min="1" step="1" value="${editar ? editar.monto : ''}" required />
      </label>
      <label>Fecha
        <input name="fecha" type="date" value="${editar ? editar.fecha : hoyISO()}" required />
      </label>
    </div>
    <label>Lote asociado (opcional)
      <select name="lote_id">
        <option value="" ${!editar?.lote_id ? 'selected' : ''}>General de finca (sin lote)</option>
        ${lotes.map((l) => `<option value="${l.id}" ${editar?.lote_id === l.id ? 'selected' : ''}>${escapeHtml(l.nombre)}</option>`).join('')}
      </select>
    </label>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${editar ? 'Guardar cambios' : 'Guardar movimiento'}</button>
    </div>
  `;
  const cerrar = abrirModal(editar ? 'Editar movimiento financiero' : 'Registrar movimiento financiero', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const datos = {
        finca_id: finca.id,
        lote_id: fd.get('lote_id') || null,
        tipo: fd.get('tipo'),
        categoria: fd.get('categoria').trim() || fd.get('tipo'),
        descripcion: fd.get('descripcion').trim(),
        monto: fd.get('monto'),
        fecha: fd.get('fecha'),
      };
      if (editar) store.actualizarMovimiento(editar.id, datos);
      else store.crearMovimiento(datos);
      mostrarToast(editar ? 'Movimiento actualizado' : 'Movimiento registrado');
      cerrar();
      if (onSave) onSave();
      else pintarTabla(finca);
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}
