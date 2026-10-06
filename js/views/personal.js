import * as store from '../store.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { formatCOP, escapeHtml } from '../format.js';

export function render(mount, finca) {
  mount.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h2>Personal</h2>
        <button id="btn-nuevo-personal" class="btn btn-primary btn-small">Agregar persona</button>
      </div>
      <div id="tabla-personal"></div>
    </div>
  `;
  mount.querySelector('#btn-nuevo-personal').addEventListener('click', () => formularioPersonal(finca));
  pintar(finca);
}

function pintar(finca) {
  const cont = document.getElementById('tabla-personal');
  if (!cont) return;
  const personas = store.listarPersonal(finca.id);

  if (personas.length === 0) {
    cont.innerHTML = `<div class="empty-state">Sin personal registrado todavía. Agrégalo aquí para elegirlo directamente al registrar una labor.</div>`;
    return;
  }

  cont.innerHTML = `
    <table>
      <thead><tr><th>Nombre</th><th>Rol</th><th>Contacto</th><th class="num">Jornal habitual</th><th>Disponible</th><th></th></tr></thead>
      <tbody>
        ${personas.map((p) => `
          <tr data-id="${p.id}">
            <td>${escapeHtml(p.nombre)}</td>
            <td>${escapeHtml(p.rol || '—')}</td>
            <td>${escapeHtml(p.contacto || '—')}</td>
            <td class="num tabular">${formatCOP(p.jornal_habitual)}</td>
            <td>${p.disponible ? '<span class="tag tag-brand">Disponible</span>' : '<span class="tag tag-muted">No disponible</span>'}</td>
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
    btn.addEventListener('click', () => formularioPersonal(finca, personas.find((p) => p.id === btn.closest('tr').dataset.id)));
  });
  cont.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      const persona = personas.find((p) => p.id === id);
      if (confirm(`¿Eliminar a "${persona.nombre}" del directorio? El historial de labores ya registradas con su nombre se conserva.`)) {
        store.eliminarPersonal(id);
        pintar(finca);
        mostrarToast('Persona eliminada del directorio');
      }
    });
  });
}

function formularioPersonal(finca, editar = null) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Nombre
      <input name="nombre" required value="${editar ? escapeHtml(editar.nombre) : ''}" placeholder="Ej. Juan Pérez" />
    </label>
    <div class="form-row">
      <label>Rol
        <input name="rol" value="${editar ? escapeHtml(editar.rol) : ''}" placeholder="Ej. Jornalero, Capataz" />
      </label>
      <label>Contacto
        <input name="contacto" value="${editar ? escapeHtml(editar.contacto) : ''}" placeholder="Teléfono (opcional)" />
      </label>
    </div>
    <div class="form-row">
      <label>Jornal habitual (COP)
        <input name="jornal_habitual" type="number" min="0" step="1000" value="${editar ? editar.jornal_habitual : '0'}" />
      </label>
      <label>Disponibilidad
        <select name="disponible">
          <option value="si" ${editar?.disponible !== false ? 'selected' : ''}>Disponible</option>
          <option value="no" ${editar?.disponible === false ? 'selected' : ''}>No disponible</option>
        </select>
      </label>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${editar ? 'Guardar cambios' : 'Guardar persona'}</button>
    </div>
  `;
  const cerrar = abrirModal(editar ? 'Editar persona' : 'Nueva persona', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const datos = {
      nombre: fd.get('nombre').trim(),
      rol: fd.get('rol').trim(),
      contacto: fd.get('contacto').trim(),
      jornal_habitual: Number(fd.get('jornal_habitual')),
      disponible: fd.get('disponible') === 'si',
    };
    if (editar) {
      store.actualizarPersonal(editar.id, datos);
      mostrarToast('Persona actualizada');
    } else {
      store.crearPersonal({ finca_id: finca.id, ...datos });
      mostrarToast('Persona agregada');
    }
    cerrar();
    pintar(finca);
  });
}
