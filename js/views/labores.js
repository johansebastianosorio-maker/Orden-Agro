import * as store from '../store.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { formatCOP, formatFecha, hoyISO, escapeHtml } from '../format.js';

const TIPOS_LABOR = ['Siembra', 'Fertilización', 'Control fitosanitario', 'Poda', 'Cosecha', 'Riego', 'Mantenimiento', 'Otro'];
const ESTADOS = ['pendiente', 'en curso', 'completada'];

export function render(mount, finca) {
  mount.innerHTML = `
    <div class="panel" style="margin-bottom: 24px;">
      <div class="panel-header">
        <h2>Cronograma de Labores</h2>
        <div style="display: flex; gap: 8px;">
          <button id="btn-vista-tablero" class="btn btn-ghost btn-small active">Tablero Kanban</button>
          <button id="btn-vista-lista" class="btn btn-ghost btn-small">Vista Tabla</button>
          <button id="btn-nueva-labor" class="btn btn-primary btn-small">+ Nueva Labor</button>
        </div>
      </div>
    </div>
    <div id="contenedor-labores"></div>
  `;
  
  const cont = mount.querySelector('#contenedor-labores');
  
  let vistaActual = 'tablero';
  
  mount.querySelector('#btn-vista-tablero').addEventListener('click', (e) => {
    vistaActual = 'tablero';
    e.target.classList.add('active');
    mount.querySelector('#btn-vista-lista').classList.remove('active');
    pintarLabores(finca, cont, vistaActual);
  });
  
  mount.querySelector('#btn-vista-lista').addEventListener('click', (e) => {
    vistaActual = 'lista';
    e.target.classList.add('active');
    mount.querySelector('#btn-vista-tablero').classList.remove('active');
    pintarLabores(finca, cont, vistaActual);
  });

  mount.querySelector('#btn-nueva-labor').addEventListener('click', () => {
    formularioLabor(finca, () => pintarLabores(finca, cont, vistaActual));
  });

  pintarLabores(finca, cont, vistaActual);
}

function pintarLabores(finca, contenedor, vista) {
  const labores = store.listarLabores(finca.id);
  const lotes = store.listarLotes(finca.id);
  const loteNombre = (id) => lotes.find((l) => l.id === id)?.nombre || 'General (sin lote)';

  if (labores.length === 0) {
    contenedor.innerHTML = `<div class="empty-state">Sin labores registradas. Crea una labor para iniciar el cronograma.</div>`;
    return;
  }

  if (vista === 'tablero') {
    renderTableroKanban(contenedor, labores, loteNombre, finca);
  } else {
    renderVistaLista(contenedor, labores, loteNombre, finca);
  }
}

function renderTableroKanban(contenedor, labores, loteNombre, finca) {
  const columnas = [
    { id: 'pendiente', titulo: '📅 Planeado / Pendiente' },
    { id: 'en curso', titulo: '🚜 En Curso' },
    { id: 'completada', titulo: '✅ Completado (Costeado)' }
  ];

  contenedor.innerHTML = `
    <div class="kanban-board" style="display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; padding-bottom: 16px;">
      ${columnas.map(col => `
        <div class="kanban-col" style="flex: 1; min-width: 280px; background: var(--surface); border-radius: 8px; padding: 12px; border: 1px solid var(--soil-light);">
          <h3 style="font-size: 1rem; color: var(--soil-dark); margin-bottom: 12px; display: flex; justify-content: space-between;">
            ${col.titulo} <span style="background: var(--soil-light); padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${labores.filter(l => l.estado === col.id).length}</span>
          </h3>
          <div class="kanban-cards" style="display: flex; flex-direction: column; gap: 10px;">
            ${labores.filter(l => l.estado === col.id).map(l => `
              <div class="kanban-card" style="background: white; border: 1px solid var(--soil-light); border-radius: 6px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                  <span class="tag tag-soil" style="font-size: 0.75rem;">${escapeHtml(l.tipo)}</span>
                  <span style="font-size: 0.75rem; color: var(--soil); font-family: monospace;">${formatFecha(l.fecha)}</span>
                </div>
                <h4 style="margin: 0 0 4px 0; font-size: 1rem;">${escapeHtml(l.nombre)}</h4>
                <p style="font-size: 0.85rem; color: var(--soil-dark); margin: 0 0 12px 0;">📍 ${escapeHtml(loteNombre(l.lote_id))}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="tabular" style="font-size: 0.85rem; font-weight: 600; color: ${col.id === 'completada' ? 'var(--rust)' : 'var(--soil)'}" title="${col.id === 'completada' ? 'Costo contabilizado' : store.costoDeLabor(l.id) > 0 ? 'Costo histórico ya contabilizado' : 'Proyección; se contabiliza al completar'}">${formatCOP(col.id === 'completada' || store.costoDeLabor(l.id) > 0 ? store.costoDeLabor(l.id) : store.costoEstimadoLabor(l.id))}</span>
                  <select data-accion="estado" data-id="${l.id}" class="btn-small" style="padding: 2px 4px; font-size: 0.75rem; background: var(--surface);">
                    ${ESTADOS.map((e) => `<option value="${e}" ${l.estado === e ? 'selected' : ''}>Mover a ${e}</option>`).join('')}
                  </select>
                </div>
                <div style="margin-top: 8px; text-align: right;">
                  <button class="btn-ghost btn-small" data-accion="editar" data-id="${l.id}" style="font-size: 0.75rem; padding: 2px 6px;">Editar</button>
                  <button class="btn-ghost btn-small" data-accion="detalle" data-id="${l.id}" style="font-size: 0.75rem; padding: 2px 6px;">Ver detalles</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  vincularEventosLabores(contenedor, labores, loteNombre, finca);
}

function renderVistaLista(contenedor, labores, loteNombre, finca) {
  contenedor.innerHTML = `
    <div class="panel">
      <table>
        <thead><tr><th>Fecha</th><th>Labor</th><th>Lote</th><th>Tipo</th><th>Estado</th><th class="num">Costo / proyección</th><th></th></tr></thead>
        <tbody>
          ${labores.map((l) => `
            <tr data-id="${l.id}">
              <td class="tabular">${formatFecha(l.fecha)}</td>
              <td>${escapeHtml(l.nombre)}</td>
              <td>${escapeHtml(loteNombre(l.lote_id))}</td>
              <td><span class="tag tag-soil">${escapeHtml(l.tipo)}</span></td>
              <td>
                <select data-accion="estado" data-id="${l.id}" class="btn-small" style="width:auto;padding:4px 6px;">
                  ${ESTADOS.map((e) => `<option value="${e}" ${l.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
                </select>
              </td>
              <td class="num tabular" title="${l.estado === 'completada' ? 'Costo contabilizado' : store.costoDeLabor(l.id) > 0 ? 'Costo histórico ya contabilizado' : 'Proyección; se contabiliza al completar'}">${formatCOP(l.estado === 'completada' || store.costoDeLabor(l.id) > 0 ? store.costoDeLabor(l.id) : store.costoEstimadoLabor(l.id))}</td>
              <td class="row-actions">
                <button class="icon-btn" data-accion="editar" data-id="${l.id}">Editar</button>
                <button class="icon-btn" data-accion="detalle" data-id="${l.id}">Detalle</button>
                <button class="icon-btn danger" data-accion="eliminar" data-id="${l.id}">Eliminar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  vincularEventosLabores(contenedor, labores, loteNombre, finca);
}

function vincularEventosLabores(contenedor, labores, loteNombre, finca) {
  contenedor.querySelectorAll('[data-accion="estado"]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const labor = labores.find((l) => l.id === sel.dataset.id);
      try {
        store.actualizarEstadoLabor(sel.dataset.id, sel.value);
        mostrarToast(sel.value === 'completada'
          ? 'Labor completada; inventario y costos actualizados.'
          : 'Estado actualizado.');
        window.dispatchEvent(new Event('hashchange'));
      } catch (error) {
        sel.value = labor.estado;
        mostrarToast(error.message);
      }
    });
  });
  contenedor.querySelectorAll('[data-accion="detalle"]').forEach((btn) => {
    btn.addEventListener('click', () => verDetalleLabor(labores.find((l) => l.id === btn.dataset.id), loteNombre));
  });
  contenedor.querySelectorAll('[data-accion="editar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const labor = labores.find((l) => l.id === btn.dataset.id);
      formularioLabor(finca, labor);
    });
  });
  contenedor.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const labor = labores.find((l) => l.id === id);
      if (confirm(`¿Eliminar la labor "${labor.nombre}"? Esto revierte el stock consumido y borra sus costos asociados.`)) {
        try {
          store.eliminarLabor(id);
          mostrarToast('Labor eliminada');
          window.dispatchEvent(new Event('hashchange'));
        } catch (error) {
          mostrarToast(error.message);
        }
      }
    });
  });
}

function verDetalleLabor(labor, loteNombre) {
  const manoObra = store.getManoObraDeLabor(labor.id);
  const consumos = store.getConsumosDeLabor(labor.id);
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="content-subtitle">${escapeHtml(loteNombre(labor.lote_id))} · ${formatFecha(labor.fecha)} · ${escapeHtml(labor.tipo)}</p>
    ${labor.estado === 'completada' ? '' : '<p class="tag tag-finance">Proyección: inventario y costos se registran al completar.</p>'}
    ${labor.descripcion ? `<p>${escapeHtml(labor.descripcion)}</p>` : ''}
    <div class="subsection">
      <h3>Mano de obra</h3>
      ${manoObra.length === 0 ? '<p class="content-subtitle">Sin registrar.</p>' : `
        <table><tbody>
          ${manoObra.map((m) => `<tr><td>${escapeHtml(m.trabajador || 'Jornal')}</td><td class="num">${m.jornales} jornales</td><td class="num tabular">${formatCOP(m.jornales * m.valor_jornal)}</td></tr>`).join('')}
        </tbody></table>
      `}
    </div>
    <div class="subsection">
      <h3>Insumos y herramientas</h3>
      ${consumos.length === 0 ? '<p class="content-subtitle">Sin registrar.</p>' : `
        <table><tbody>
          ${consumos.map((c) => `<tr><td>${escapeHtml(c.item_nombre)}</td><td class="num">${c.cantidad} ${escapeHtml(c.unidad)}</td><td class="num tabular">${formatCOP(c.cantidad * c.costo_unitario)}</td></tr>`).join('')}
        </tbody></table>
      `}
    </div>
  `;
  abrirModal(labor.nombre, body);
}

function formularioLabor(finca, editar = null) {
  const lotes = store.listarLotes(finca.id);
  const insumos = store.listarInsumos(finca.id);
  const herramientas = store.listarHerramientas(finca.id);
  const personal = store.listarPersonal(finca.id);

  const form = document.createElement('form');
  form.innerHTML = `
    <label>Lote
      <select name="lote_id">
        <option value="" ${!editar?.lote_id ? 'selected' : ''}>General de finca (sin lote)</option>
        ${lotes.map((l) => `<option value="${l.id}" ${editar?.lote_id === l.id ? 'selected' : ''}>${escapeHtml(l.nombre)}</option>`).join('')}
      </select>
    </label>
    <label>Nombre de la labor
      <input name="nombre" required value="${editar ? escapeHtml(editar.nombre) : ''}" placeholder="Ej. Fertilización de sostenimiento" />
    </label>
    <div class="form-row">
      <label>Tipo
        <select name="tipo">${TIPOS_LABOR.map((t) => `<option ${editar?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </label>
      <label>Fecha
        <input name="fecha" type="date" value="${editar?.fecha || hoyISO()}" required />
      </label>
    </div>
    <label>Estado
      <select name="estado">${ESTADOS.map((e) => `<option ${editar?.estado === e || (!editar && e === 'pendiente') ? 'selected' : ''}>${e}</option>`).join('')}</select>
    </label>
    <p class="content-subtitle">El inventario se descuenta y los costos se contabilizan únicamente cuando marques la labor como completada.</p>
    <label>Descripción (opcional)
      <textarea name="descripcion" rows="2">${editar ? escapeHtml(editar.descripcion) : ''}</textarea>
    </label>

    <div class="subsection">
      <div class="panel-header" style="margin-bottom:8px;">
        <h3>Mano de obra</h3>
        <button type="button" id="btn-add-mo" class="btn btn-ghost btn-small">+ Agregar jornal</button>
      </div>
      <div id="filas-mo"></div>
    </div>

    <div class="subsection">
      <div class="panel-header" style="margin-bottom:8px;">
        <h3>Insumos / herramientas usados</h3>
        <button type="button" id="btn-add-consumo" class="btn btn-ghost btn-small">+ Agregar ítem</button>
      </div>
      <div id="filas-consumo"></div>
    </div>

    <p id="error-labor" class="stock-warning hidden"></p>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${editar ? 'Guardar cambios' : 'Guardar labor'}</button>
    </div>
  `;

  const filasMO = form.querySelector('#filas-mo');
  const filasConsumo = form.querySelector('#filas-consumo');

  function agregarFilaMO(inicial = null) {
    const fila = document.createElement('div');
    fila.className = 'form-row-3';
    fila.style.marginBottom = '8px';
    const opcionesPersonal = personal.map((p) => `<option value="${p.id}" data-jornal="${p.jornal_habitual}">${escapeHtml(p.nombre)}${p.disponible === false ? ' (no disponible)' : ''}</option>`).join('');
    fila.innerHTML = `
      <select data-campo="personal_id">
        <option value="">Otro (escribir nombre)</option>
        ${opcionesPersonal}
      </select>
      <input type="number" min="0" step="0.5" placeholder="Jornales" data-campo="jornales" value="${inicial?.jornales ?? ''}" />
      <input type="number" min="0" step="1000" placeholder="Valor por jornal (COP)" data-campo="valor_jornal" value="${inicial?.valor_jornal ?? ''}" />
    `;
    const inputNombre = document.createElement('input');
    inputNombre.placeholder = 'Nombre del trabajador';
    inputNombre.dataset.campo = 'trabajador_manual';
    inputNombre.value = inicial?.trabajador || '';
    inputNombre.style.marginTop = '6px';
    fila.appendChild(inputNombre);

    const selectPersonal = fila.querySelector('[data-campo="personal_id"]');
    const inputValorJornal = fila.querySelector('[data-campo="valor_jornal"]');
    function sincronizarSelector() {
      const opt = selectPersonal.selectedOptions[0];
      const esOtro = selectPersonal.value === '';
      inputNombre.classList.toggle('hidden', !esOtro);
      if (!esOtro && opt.dataset.jornal && Number(opt.dataset.jornal) > 0) {
        inputValorJornal.value = opt.dataset.jornal;
      }
    }
    selectPersonal.addEventListener('change', sincronizarSelector);
    sincronizarSelector();

    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.className = 'icon-btn danger';
    btnQuitar.textContent = 'Quitar';
    btnQuitar.addEventListener('click', () => fila.remove());
    fila.appendChild(btnQuitar);
    filasMO.appendChild(fila);
    if (inicial?.personal_id) {
      selectPersonal.value = inicial.personal_id;
      sincronizarSelector();
    }
  }

  function agregarFilaConsumo(inicial = null) {
    const fila = document.createElement('div');
    fila.className = 'form-row-3';
    fila.style.marginBottom = '8px';
    const opciones = [
      ...insumos.map((i) => `<option value="insumo:${i.id}" ${inicial?.item_tipo === 'insumo' && inicial?.item_id === i.id ? 'selected' : ''}>Insumo — ${escapeHtml(i.nombre)} (stock: ${i.stock_actual} ${escapeHtml(i.unidad)})</option>`),
      ...herramientas.map((h) => `<option value="herramienta:${h.id}" ${inicial?.item_tipo === 'herramienta' && inicial?.item_id === h.id ? 'selected' : ''}>Herramienta — ${escapeHtml(h.nombre)}</option>`),
    ].join('');
    fila.innerHTML = `
      <select data-campo="item">${opciones || '<option disabled selected>No hay insumos ni herramientas registrados</option>'}</select>
      <input type="number" min="0" step="0.1" placeholder="Cantidad" data-campo="cantidad" value="${inicial?.cantidad ?? ''}" />
      <span></span>
    `;
    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.className = 'icon-btn danger';
    btnQuitar.textContent = 'Quitar';
    btnQuitar.addEventListener('click', () => fila.remove());
    fila.appendChild(btnQuitar);
    filasConsumo.appendChild(fila);
  }

  form.querySelector('#btn-add-mo').addEventListener('click', agregarFilaMO);
  form.querySelector('#btn-add-consumo').addEventListener('click', agregarFilaConsumo);
  const manoObraExistente = editar ? store.getManoObraDeLabor(editar.id) : [];
  const consumosExistentes = editar ? store.getConsumosDeLabor(editar.id) : [];
  if (manoObraExistente.length) manoObraExistente.forEach(agregarFilaMO);
  else agregarFilaMO();
  if (consumosExistentes.length) consumosExistentes.forEach(agregarFilaConsumo);
  else if (insumos.length > 0 || herramientas.length > 0) agregarFilaConsumo();

  const cerrar = abrirModal(editar ? 'Editar labor' : 'Registrar labor', form);
  const errorEl = form.querySelector('#error-labor');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    const manoObra = [...filasMO.querySelectorAll('.form-row-3')].map((fila) => {
      const personalId = fila.querySelector('[data-campo="personal_id"]').value || null;
      const persona = personalId ? personal.find((p) => p.id === personalId) : null;
      return {
        personal_id: personalId,
        trabajador: persona ? persona.nombre : fila.querySelector('[data-campo="trabajador_manual"]').value.trim(),
        jornales: Number(fila.querySelector('[data-campo="jornales"]').value) || 0,
        valor_jornal: Number(fila.querySelector('[data-campo="valor_jornal"]').value) || 0,
      };
    }).filter((m) => m.jornales > 0);

    const consumos = [...filasConsumo.querySelectorAll('.form-row-3')].map((fila) => {
      const val = fila.querySelector('[data-campo="item"]')?.value || '';
      const [item_tipo, item_id] = val.split(':');
      return {
        item_tipo,
        item_id,
        cantidad: Number(fila.querySelector('[data-campo="cantidad"]').value) || 0,
      };
    }).filter((c) => c.item_id && c.cantidad > 0);

    try {
      const datos = {
        finca_id: finca.id,
        lote_id: fd.get('lote_id') || null,
        nombre: fd.get('nombre').trim(),
        tipo: fd.get('tipo'),
        fecha: fd.get('fecha'),
        estado: fd.get('estado'),
        descripcion: fd.get('descripcion').trim(),
        manoObra,
        consumos,
      };
      if (editar) store.actualizarLabor(editar.id, datos);
      else store.crearLabor(datos);
      mostrarToast(editar ? 'Labor actualizada' : 'Labor registrada');
      cerrar();
      window.dispatchEvent(new Event('hashchange'));
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });
}
