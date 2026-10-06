import * as store from '../store.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { formatCOP, escapeHtml } from '../format.js';

const UNIDADES = ['kg', 'g', 'L', 'ml', 'ud', 'bulto', 'lb'];
const CATEGORIAS_INSUMO = ['Fertilizante', 'Fitosanitario', 'Semilla / material vegetal', 'Enmienda', 'Otro'];
const CATEGORIAS_HERRAMIENTA = ['Manual', 'Motorizada', 'Equipo de riego', 'Equipo de cosecha', 'Otro'];

export function render(mount, finca) {
  mount.innerHTML = `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <h2>Insumos</h2>
          <button id="btn-nuevo-insumo" class="btn btn-primary btn-small">Agregar insumo</button>
        </div>
        <div id="tabla-insumos"></div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <h2>Herramientas</h2>
          <button id="btn-nueva-herramienta" class="btn btn-primary btn-small">Agregar herramienta</button>
        </div>
        <div id="tabla-herramientas"></div>
      </div>
    </div>
  `;

  mount.querySelector('#btn-nuevo-insumo').addEventListener('click', () => formularioInsumo(finca));
  mount.querySelector('#btn-nueva-herramienta').addEventListener('click', () => formularioHerramienta(finca));

  pintarInsumos(finca);
  pintarHerramientas(finca);
}

function pintarInsumos(finca) {
  const cont = document.getElementById('tabla-insumos');
  if (!cont) return;
  const insumos = store.listarInsumos(finca.id);

  if (insumos.length === 0) {
    cont.innerHTML = `<div class="empty-state">Sin insumos registrados todavía.</div>`;
    return;
  }

  cont.innerHTML = `
    <table>
      <thead><tr><th>Nombre</th><th>Categoría</th><th class="num">Stock</th><th class="num">Costo unit.</th><th></th></tr></thead>
      <tbody>
        ${insumos.map((i) => `
          <tr data-id="${i.id}">
            <td>${escapeHtml(i.nombre)}</td>
            <td><span class="tag tag-soil">${escapeHtml(i.categoria)}</span></td>
            <td class="num tabular">${i.stock_actual <= 0
              ? `<span class="tag tag-rust">Sin stock</span>`
              : `${i.stock_actual} ${escapeHtml(i.unidad)}`}</td>
            <td class="num tabular">${formatCOP(i.costo_unitario)}</td>
            <td class="row-actions">
              <button class="icon-btn" data-accion="editar">Editar</button>
              <button class="icon-btn danger" data-accion="eliminar">Eliminar</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  cont.querySelectorAll('[data-accion="editar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      formularioInsumo(finca, insumos.find((i) => i.id === id));
    });
  });
  cont.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      const insumo = insumos.find((i) => i.id === id);
      if (confirm(`¿Eliminar "${insumo.nombre}" del inventario?`)) {
        store.eliminarInsumo(id);
        pintarInsumos(finca);
        mostrarToast('Insumo eliminado');
      }
    });
  });
}

function pintarHerramientas(finca) {
  const cont = document.getElementById('tabla-herramientas');
  if (!cont) return;
  const herramientas = store.listarHerramientas(finca.id);

  if (herramientas.length === 0) {
    cont.innerHTML = `<div class="empty-state">Sin herramientas registradas todavía.</div>`;
    return;
  }

  cont.innerHTML = `
    <table>
      <thead><tr><th>Nombre</th><th>Categoría</th><th class="num">Disponibles</th><th class="num">Costo de uso</th><th></th></tr></thead>
      <tbody>
        ${herramientas.map((h) => `
          <tr data-id="${h.id}">
            <td>${escapeHtml(h.nombre)}</td>
            <td><span class="tag tag-soil">${escapeHtml(h.categoria)}</span></td>
            <td class="num tabular">${h.cantidad_disponible}</td>
            <td class="num tabular">${h.costo_uso_unitario > 0 ? formatCOP(h.costo_uso_unitario) : '—'}</td>
            <td class="row-actions">
              <button class="icon-btn" data-accion="editar">Editar</button>
              <button class="icon-btn danger" data-accion="eliminar">Eliminar</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  cont.querySelectorAll('[data-accion="editar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      formularioHerramienta(finca, herramientas.find((h) => h.id === id));
    });
  });
  cont.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      const h = herramientas.find((x) => x.id === id);
      if (confirm(`¿Eliminar "${h.nombre}" del inventario?`)) {
        store.eliminarHerramienta(id);
        pintarHerramientas(finca);
        mostrarToast('Herramienta eliminada');
      }
    });
  });
}

function formularioInsumo(finca, editar = null) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Nombre
      <input name="nombre" required value="${editar ? escapeHtml(editar.nombre) : ''}" placeholder="Ej. Fertilizante 15-15-15" />
    </label>
    <div class="form-row">
      <label>Categoría
        <select name="categoria">
          ${CATEGORIAS_INSUMO.map((c) => `<option ${editar?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </label>
      <label>Unidad
        <select name="unidad">
          ${UNIDADES.map((u) => `<option ${editar?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="form-row">
      <label>Stock actual
        <input name="stock_actual" type="number" min="0" step="0.01" required value="${editar ? editar.stock_actual : '0'}" />
      </label>
      <label>Costo unitario (COP)
        <input name="costo_unitario" type="number" min="0" step="1" required value="${editar ? editar.costo_unitario : '0'}" />
      </label>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${editar ? 'Guardar cambios' : 'Guardar insumo'}</button>
    </div>
  `;
  const cerrar = abrirModal(editar ? 'Editar insumo' : 'Nuevo insumo', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const datos = {
      nombre: fd.get('nombre').trim(),
      categoria: fd.get('categoria'),
      unidad: fd.get('unidad'),
      stock_actual: fd.get('stock_actual'),
      costo_unitario: fd.get('costo_unitario'),
    };
    try {
      if (editar) {
        store.actualizarInsumo(editar.id, { ...datos, stock_actual: Number(datos.stock_actual), costo_unitario: Number(datos.costo_unitario) });
        mostrarToast('Insumo actualizado');
      } else {
        store.crearInsumo({ finca_id: finca.id, ...datos });
        mostrarToast('Insumo creado');
      }
      cerrar();
      pintarInsumos(finca);
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}

function formularioHerramienta(finca, editar = null) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Nombre
      <input name="nombre" required value="${editar ? escapeHtml(editar.nombre) : ''}" placeholder="Ej. Guadañadora" />
    </label>
    <label>Categoría
      <select name="categoria">
        ${CATEGORIAS_HERRAMIENTA.map((c) => `<option ${editar?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </label>
    <div class="form-row">
      <label>Unidades disponibles
        <input name="cantidad_disponible" type="number" min="0" step="1" required value="${editar ? editar.cantidad_disponible : '1'}" />
      </label>
      <label>Costo de uso por labor (COP, opcional)
        <input name="costo_uso_unitario" type="number" min="0" step="1" value="${editar ? editar.costo_uso_unitario : '0'}" />
      </label>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${editar ? 'Guardar cambios' : 'Guardar herramienta'}</button>
    </div>
  `;
  const cerrar = abrirModal(editar ? 'Editar herramienta' : 'Nueva herramienta', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const datos = {
      nombre: fd.get('nombre').trim(),
      categoria: fd.get('categoria'),
      cantidad_disponible: Number(fd.get('cantidad_disponible')),
      costo_uso_unitario: Number(fd.get('costo_uso_unitario')),
    };
    try {
      if (editar) {
        store.actualizarHerramienta(editar.id, datos);
        mostrarToast('Herramienta actualizada');
      } else {
        store.crearHerramienta({ finca_id: finca.id, ...datos });
        mostrarToast('Herramienta creada');
      }
      cerrar();
      pintarHerramientas(finca);
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}
