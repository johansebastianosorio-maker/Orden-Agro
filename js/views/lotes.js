import * as store from '../store.js';
import { crearEditorLotes } from '../canvas.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { escapeHtml } from '../format.js';
import { obtenerUbicacionActual, gpsAMetrosLocales, areaHaDePoligono } from '../geo.js';

const PALETA = ['#35573C', '#8C6A3F', '#4C6B8A', '#A6763B', '#5C7A99', '#6E8C4E', '#9C5B45', '#4A7C6F'];

let editor = null;
let seleccionadoId = null;

export function render(mount, finca) {
  mount.innerHTML = `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <h2>Diagrama de la finca</h2>
        </div>
        <div class="canvas-toolbar">
          <button id="btn-dibujar" class="btn btn-primary btn-small">Dibujar nuevo lote</button>
          <button id="btn-deshacer" class="btn btn-ghost btn-small hidden">Deshacer punto</button>
          <button id="btn-cancelar-dibujo" class="btn btn-ghost btn-small hidden">Cancelar</button>
          <button id="btn-finalizar" class="btn btn-primary btn-small hidden" disabled>Finalizar lote (mín. 3 puntos)</button>
          <span class="canvas-hint">Toca sobre el lienzo para marcar una esquina, o usa tu ubicación GPS parado en ella.</span>
        </div>
        <div id="gps-row" class="gps-btn-row hidden">
          <button id="btn-gps" class="btn btn-ghost btn-small">📍 Usar mi ubicación (GPS)</button>
          <span id="gps-status" class="gps-status"></span>
        </div>
        <div class="canvas-wrap">
          <svg id="lote-svg"></svg>
        </div>
        <p class="canvas-scale-hint">El diagrama está a escala real (metros). Un punto <span class="swatch" style="width:8px;height:8px;background:var(--brand);display:inline-block;border-radius:50%;"></span> verde fue capturado por GPS; uno azul se marcó a mano.</p>
      </div>

      <div class="panel">
        <div class="panel-header"><h2>Lotes (${store.listarLotes(finca.id).length})</h2></div>
        <div id="lista-lotes"></div>
      </div>
    </div>
  `;

  const svg = mount.querySelector('#lote-svg');
  const btnDibujar = mount.querySelector('#btn-dibujar');
  const btnDeshacer = mount.querySelector('#btn-deshacer');
  const btnCancelar = mount.querySelector('#btn-cancelar-dibujo');
  const btnFinalizar = mount.querySelector('#btn-finalizar');
  const gpsRow = mount.querySelector('#gps-row');
  const btnGps = mount.querySelector('#btn-gps');
  const gpsStatus = mount.querySelector('#gps-status');

  editor = crearEditorLotes(svg, {
    onSeleccionar: (id) => {
      seleccionadoId = seleccionadoId === id ? null : id;
      editor.render(store.listarLotes(finca.id), seleccionadoId);
      pintarLista(finca);
    },
    onPuntosCambiaron: (n) => {
      btnFinalizar.disabled = n < 3;
      btnFinalizar.textContent = n < 3 ? `Finalizar lote (mín. 3 puntos)` : `Finalizar lote (${n} puntos)`;
    },
  });
  editor.render(store.listarLotes(finca.id), seleccionadoId);
  pintarLista(finca);

  btnDibujar.addEventListener('click', () => {
    editor.iniciarDibujo();
    btnDibujar.classList.add('hidden');
    btnDeshacer.classList.remove('hidden');
    btnCancelar.classList.remove('hidden');
    btnFinalizar.classList.remove('hidden');
    gpsRow.classList.remove('hidden');
    gpsStatus.textContent = '';
  });
  btnDeshacer.addEventListener('click', () => editor.deshacerPunto());
  btnCancelar.addEventListener('click', () => {
    editor.cancelarDibujo();
    salirModoDibujo();
  });
  btnFinalizar.addEventListener('click', () => {
    const puntos = editor.finalizarDibujo();
    if (!puntos) return;
    salirModoDibujo();
    abrirFormularioLote(finca, { poligono: puntos });
  });

  btnGps.addEventListener('click', async () => {
    btnGps.disabled = true;
    gpsStatus.classList.remove('err');
    gpsStatus.textContent = 'Obteniendo ubicación…';
    try {
      const { lat, lng, accuracy } = await obtenerUbicacionActual();
      const origen = store.establecerOrigenGpsSiFalta(finca.id, { lat, lng }) || finca.origen_gps || { lat, lng };
      const { x, y } = gpsAMetrosLocales(lat, lng, origen);
      editor.agregarPuntoGPS({ x, y, lat, lng });
      gpsStatus.textContent = `Punto capturado (precisión ≈ ${Math.round(accuracy)} m)`;
    } catch (err) {
      gpsStatus.classList.add('err');
      gpsStatus.textContent = err.message;
    } finally {
      btnGps.disabled = false;
    }
  });

  function salirModoDibujo() {
    btnDibujar.classList.remove('hidden');
    btnDeshacer.classList.add('hidden');
    btnCancelar.classList.add('hidden');
    btnFinalizar.classList.add('hidden');
    gpsRow.classList.add('hidden');
  }
}

function pintarLista(finca) {
  const cont = document.getElementById('lista-lotes');
  if (!cont) return;
  const lotes = store.listarLotes(finca.id);

  if (lotes.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no has dibujado lotes. Usa "Dibujar nuevo lote" sobre el diagrama.</div>`;
    return;
  }

  cont.innerHTML = lotes.map((lote) => {
    const tieneGps = (lote.poligono || []).some((p) => p.lat !== null && p.lat !== undefined);
    return `
    <div class="lote-list-item ${lote.id === seleccionadoId ? 'selected' : ''}" data-id="${lote.id}">
      <div class="lote-list-item-head">
        <span><span class="swatch" style="background:${lote.color}"></span> <strong>${escapeHtml(lote.nombre)}</strong>${tieneGps ? '<span class="tag-gps">GPS</span>' : ''}</span>
        <span class="row-actions">
          <button class="icon-btn" data-accion="editar" data-id="${lote.id}">Editar</button>
          <button class="icon-btn danger" data-accion="eliminar" data-id="${lote.id}">Eliminar</button>
        </span>
      </div>
      <div class="lote-list-item-meta">${escapeHtml(lote.cultivo || 'Sin cultivo asignado')}${lote.variedad ? ` · ${escapeHtml(lote.variedad)}` : ''} · ${lote.area_ha} ha${store.arbolesEstimadosLote(lote) !== null ? ` · ${store.arbolesEstimadosLote(lote).toLocaleString('es-CO')} árboles` : ''}</div>
    </div>
  `;
  }).join('');

  cont.querySelectorAll('[data-accion="editar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lote = store.listarLotes(finca.id).find((l) => l.id === btn.dataset.id);
      abrirFormularioLote(finca, { editar: lote });
    });
  });
  cont.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lote = store.listarLotes(finca.id).find((l) => l.id === btn.dataset.id);
      if (confirm(`¿Eliminar el lote "${lote.nombre}"? El historial financiero asociado se conserva sin lote.`)) {
        store.eliminarLote(btn.dataset.id);
        seleccionadoId = null;
        editor.render(store.listarLotes(finca.id), seleccionadoId);
        pintarLista(finca);
        mostrarToast('Lote eliminado');
      }
    });
  });

  cont.querySelectorAll('.lote-list-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      seleccionadoId = seleccionadoId === item.dataset.id ? null : item.dataset.id;
      editor.render(store.listarLotes(finca.id), seleccionadoId);
      pintarLista(finca);
    });
  });
}

function abrirFormularioLote(finca, { poligono = null, editar = null } = {}) {
  const form = document.createElement('form');
  const colorInicial = editar?.color || PALETA[store.listarLotes(finca.id).length % PALETA.length];
  const areaSugerida = poligono ? areaHaDePoligono(poligono) : (editar ? editar.area_ha : '');

  form.innerHTML = `
    <label>Nombre del lote
      <input name="nombre" required value="${editar ? escapeHtml(editar.nombre) : ''}" placeholder="Ej. Lote 3 — Ladera" />
    </label>
    <label>Cultivo / uso
      <input name="cultivo" value="${editar ? escapeHtml(editar.cultivo) : ''}" placeholder="Ej. Aguacate Hass, Café, Plátano" />
    </label>
    <div class="form-row">
      <label>Variedad / cultivar
        <input name="variedad" value="${editar ? escapeHtml(editar.variedad || '') : ''}" placeholder="Ej. Castillo, Caturra" />
      </label>
      <label>Edad del cultivo (años)
        <input name="edad_anios" type="number" min="0" step="0.1" value="${editar?.edad_anios ?? ''}" placeholder="Opcional" />
      </label>
    </div>
    <label>Área (hectáreas)${poligono ? ' — calculada del diagrama, ajústala si lo necesitas' : ''}
      <input name="area_ha" type="number" min="0" step="0.01" value="${areaSugerida}" required />
    </label>
    <label>Área productiva efectiva (ha)
      <input name="area_productiva_ha" type="number" min="0.01" step="0.01" value="${editar?.area_productiva_ha ?? ''}" placeholder="Opcional; si se omite se usa el área total" />
    </label>
    <div class="form-row">
      <label>Distancia entre surcos (m)
        <input name="distancia_surcos_m" type="number" min="0.1" step="0.1" value="${editar?.distancia_surcos_m ?? ''}" placeholder="Ej. 2.0" />
      </label>
      <label>Distancia entre plantas (m)
        <input name="distancia_plantas_m" type="number" min="0.1" step="0.1" value="${editar?.distancia_plantas_m ?? ''}" placeholder="Ej. 1.0" />
      </label>
    </div>
    <label>Árboles reales (si conoces el dato)
      <input name="arboles_actuales" type="number" min="0" step="1" value="${editar?.arboles_actuales ?? ''}" placeholder="Si se deja vacío, se estima por área y distancias" />
    </label>
    <label>Árboles productivos vivos (si conoces el dato)
      <input name="arboles_productivos" type="number" min="0" step="1" value="${editar?.arboles_productivos ?? ''}" placeholder="Opcional; no se infiere de la densidad" />
    </label>
    <div class="form-row">
      <label>Altitud aproximada (m s. n. m.)
        <input name="altitud_m" type="number" min="0" step="1" value="${editar?.altitud_m ?? ''}" placeholder="Opcional" />
      </label>
      <label>Tipo/característica de suelo
        <input name="tipo_suelo" value="${editar ? escapeHtml(editar.tipo_suelo || '') : ''}" placeholder="Si lo conoces" />
      </label>
    </div>
    <div class="form-row">
      <label>Riego
        <select name="riego">
          <option value="desconocido" ${!editar || editar.riego === 'desconocido' ? 'selected' : ''}>No informado</option>
          <option value="si" ${editar?.riego === 'si' ? 'selected' : ''}>Sí</option>
          <option value="no" ${editar?.riego === 'no' ? 'selected' : ''}>No</option>
        </select>
      </label>
      <label>Sistema de sombra
        <select name="sombra">
          <option value="desconocido" ${!editar || editar.sombra === 'desconocido' ? 'selected' : ''}>No informado</option>
          <option value="pleno_sol" ${editar?.sombra === 'pleno_sol' ? 'selected' : ''}>Pleno sol</option>
          <option value="sombra" ${editar?.sombra === 'sombra' ? 'selected' : ''}>Con sombra</option>
          <option value="mixto" ${editar?.sombra === 'mixto' ? 'selected' : ''}>Mixto</option>
        </select>
      </label>
    </div>
    <p class="content-subtitle">El cálculo por distancias es una estimación geométrica; no descuenta caminos, bordes ni árboles faltantes. Si conoces el conteo real, ingrésalo.</p>
    <label>Color en el diagrama
      <div class="color-swatches">
        ${PALETA.map((c) => `<span class="color-swatch ${c === colorInicial ? 'selected' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
      </div>
      <input type="hidden" name="color" value="${colorInicial}" />
    </label>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${editar ? 'Guardar cambios' : 'Guardar lote'}</button>
    </div>
  `;

  form.querySelectorAll('.color-swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      form.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
      sw.classList.add('selected');
      form.querySelector('[name="color"]').value = sw.dataset.color;
    });
  });

  const cerrar = abrirModal(editar ? 'Editar lote' : 'Nuevo lote', form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const datos = {
      nombre: fd.get('nombre').trim(),
      cultivo: fd.get('cultivo').trim(),
      area_ha: fd.get('area_ha'),
      color: fd.get('color'),
      variedad: fd.get('variedad'),
      edad_anios: fd.get('edad_anios'),
      distancia_surcos_m: fd.get('distancia_surcos_m'),
      distancia_plantas_m: fd.get('distancia_plantas_m'),
      arboles_actuales: fd.get('arboles_actuales'),
      area_productiva_ha: fd.get('area_productiva_ha'),
      arboles_productivos: fd.get('arboles_productivos'),
      altitud_m: fd.get('altitud_m'),
      tipo_suelo: fd.get('tipo_suelo'),
      riego: fd.get('riego'),
      sombra: fd.get('sombra'),
    };
    try {
      if (editar) {
        store.actualizarLote(editar.id, datos);
        mostrarToast('Lote actualizado');
      } else {
        store.crearLote({ finca_id: finca.id, poligono, ...datos });
        mostrarToast('Lote creado');
      }
      cerrar();
      editor.render(store.listarLotes(finca.id), seleccionadoId);
      pintarLista(finca);
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}
