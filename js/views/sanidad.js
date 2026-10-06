import * as store from '../store.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { escapeHtml, hoyISO, formatFecha } from '../format.js';

const TIPOS = {
  plaga: 'Plaga',
  enfermedad: 'Enfermedad',
  síntoma: 'Síntoma por identificar',
  otro: 'Otro hallazgo',
};
const DIAGNOSTICOS = {
  por_confirmar: 'Por confirmar',
  confirmado: 'Confirmado',
  descartado: 'Descartado',
};
const SEVERIDADES = {
  sin_dato: 'Sin dato',
  leve: 'Leve',
  moderada: 'Moderada',
  alta: 'Alta',
};

export function render(mount, finca) {
  const lotes = store.listarLotes(finca.id);
  mount.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="eyebrow">MONITOREO DEL CULTIVO</span>
          <h2>Plagas, enfermedades y observaciones</h2>
          <p class="content-subtitle">Registra muestreos fechados por lote. Puedes definir un umbral técnico propio para cada organismo y recibir avisos al alcanzarlo.</p>
        </div>
        <button id="btn-nuevo-registro-fito" class="btn btn-primary btn-small">Registrar monitoreo</button>
      </div>
      <div class="health-safety-note"><strong>Uso responsable:</strong> las tendencias son extrapolaciones de tus observaciones, no diagnósticos ni pronósticos biológicos. La aplicación no fija umbrales universales ni recomienda plaguicidas o dosis. Confirma el problema y el umbral con asistencia técnica local antes de intervenir.</div>
      <div class="health-filters">
        <label>Lote
          <select id="filtro-fito-lote"><option value="">Todos los lotes</option>${lotes.map((lote) => `<option value="${lote.id}">${escapeHtml(lote.nombre)}</option>`).join('')}</select>
        </label>
        <label>Tipo de hallazgo
          <select id="filtro-fito-tipo"><option value="">Todos</option>${Object.entries(TIPOS).map(([valor, texto]) => `<option value="${escapeHtml(valor)}">${escapeHtml(texto)}</option>`).join('')}</select>
        </label>
        <label>Desde
          <input id="filtro-fito-fecha" type="date" />
        </label>
        <label>Buscar organismo
          <input id="filtro-fito-busqueda" type="search" placeholder="Ej. roya" />
        </label>
        <button id="btn-limpiar-filtros-fito" class="btn btn-ghost btn-small" type="button">Limpiar filtros</button>
      </div>
      <div id="resumen-fitosanitario" class="kpi-row health-kpis"></div>
      <div id="alertas-fitosanitarias" class="health-alert-list"></div>
    </section>
    <section class="panel">
      <div class="panel-header"><h2>Historial de monitoreo</h2></div>
      <div id="tabla-fitosanitaria"></div>
    </section>
  `;

  const boton = mount.querySelector('#btn-nuevo-registro-fito');
  boton.disabled = lotes.length === 0;
  boton.addEventListener('click', () => {
    if (!lotes.length) {
      mostrarToast('Primero crea un lote para registrar un monitoreo.');
      return;
    }
    formularioRegistro(finca, lotes, null, pintar);
  });
  ['#filtro-fito-lote', '#filtro-fito-tipo', '#filtro-fito-fecha', '#filtro-fito-busqueda']
    .forEach((selector) => mount.querySelector(selector).addEventListener('input', pintar));
  mount.querySelector('#btn-limpiar-filtros-fito').addEventListener('click', () => {
    mount.querySelector('#filtro-fito-lote').value = '';
    mount.querySelector('#filtro-fito-tipo').value = '';
    mount.querySelector('#filtro-fito-fecha').value = '';
    mount.querySelector('#filtro-fito-busqueda').value = '';
    pintar();
  });
  pintar();

  function pintar() {
    const todos = store.listarRegistrosFitosanitarios(finca.id);
    const loteId = mount.querySelector('#filtro-fito-lote').value;
    const tipo = mount.querySelector('#filtro-fito-tipo').value;
    const desde = mount.querySelector('#filtro-fito-fecha').value;
    const busqueda = mount.querySelector('#filtro-fito-busqueda').value.trim().toLocaleLowerCase();
    const registros = todos.filter((registro) =>
      (!loteId || registro.lote_id === loteId) &&
      (!tipo || registro.tipo === tipo) &&
      (!desde || registro.fecha >= desde) &&
      (!busqueda || registro.agente.toLocaleLowerCase().includes(busqueda)),
    );
    renderResumen(mount.querySelector('#resumen-fitosanitario'), registros);
    if (!registros.length && todos.length) {
      mount.querySelector('#alertas-fitosanitarias').innerHTML = '<div class="empty-state">No hay alertas dentro de los filtros actuales.</div>';
      mount.querySelector('#tabla-fitosanitaria').innerHTML = '<div class="empty-state">No hay monitoreos que coincidan con la búsqueda. Ajusta o limpia los filtros.</div>';
    } else {
      renderAlertas(mount.querySelector('#alertas-fitosanitarias'), registros, lotes);
      renderHistorial(mount.querySelector('#tabla-fitosanitaria'), registros, finca, lotes, pintar);
    }
  }
}

function renderResumen(mount, registros) {
  const cuantificados = registros.filter((registro) => registro.incidencia_pct !== null);
  const agentes = new Set(registros.map((registro) => `${registro.lote_id}|${registro.agente.toLocaleLowerCase()}`));
  const alertas = agrupar(registros).filter(({ analisis }) => analisis.alerta).length;
  mount.innerHTML = `
    <div class="kpi-card"><p class="kpi-label">Monitoreos en filtro</p><p class="kpi-value tabular">${registros.length}</p></div>
    <div class="kpi-card"><p class="kpi-label">Incidencias cuantificadas</p><p class="kpi-value tabular">${cuantificados.length}</p></div>
    <div class="kpi-card"><p class="kpi-label">Lote · organismo</p><p class="kpi-value tabular">${agentes.size}</p></div>
    <div class="kpi-card"><p class="kpi-label">Seguimientos por revisar</p><p class="kpi-value tabular ${alertas ? 'negative' : ''}">${alertas}</p></div>
  `;
}

function agrupar(registros) {
  const grupos = new Map();
  for (const registro of registros) {
    const llave = `${registro.lote_id}|${registro.agente.toLocaleLowerCase()}`;
    if (!grupos.has(llave)) grupos.set(llave, []);
    grupos.get(llave).push(registro);
  }
  return [...grupos.values()].map((grupo) => {
    const actual = grupo[0];
    const analisis = store.analizarSeguimientoFitosanitario(actual.finca_id, actual.lote_id, actual.agente);
    return { actual, analisis, registros: grupo };
  });
}

function renderAlertas(mount, registros, lotes) {
  const grupos = agrupar(registros);
  const alertas = grupos.filter(({ analisis }) => analisis.alerta);
  if (!alertas.length) {
    mount.innerHTML = `<div class="empty-state">${registros.length
      ? 'No hay umbrales superados en los monitoreos registrados. La falta de alertas no descarta una plaga o enfermedad.'
      : 'Aún no hay monitoreos. Registra observaciones de campo para activar el seguimiento.'}</div>`;
    return;
  }
  mount.innerHTML = `
    <h3 class="health-alert-heading">${alertas.length} seguimiento(s) requiere(n) revisión</h3>
    <div class="grid-2">
      ${alertas.map(({ actual, analisis }) => {
        const lote = lotes.find((item) => item.id === actual.lote_id);
        return `
          <article class="health-alert-card">
            <div class="panel-header">
              <div><h3>${escapeHtml(actual.agente)}</h3><p class="content-subtitle">${escapeHtml(lote?.nombre || 'Lote')} · ${escapeHtml(TIPOS[actual.tipo] || actual.tipo)}</p></div>
              <span class="tag tag-rust">Revisar</span>
            </div>
            <p>${escapeHtml(analisis.motivo_alerta)}</p>
            <p class="content-subtitle">Última incidencia: ${analisis.actual?.incidencia_pct ?? 'sin dato'}%${analisis.umbral_control_pct === null ? '' : ` · Umbral configurado: ${analisis.umbral_control_pct}%`} · ${formatFecha(actual.fecha)}</p>
            <p class="health-advice"><strong>Siguiente paso:</strong> repetir un muestreo representativo, registrar el resultado y confirmar el diagnóstico y el umbral con un profesional o guía técnica local. No aplicar un control solo por esta alerta.</p>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderHistorial(mount, registros, finca, lotes, pintar) {
  if (!registros.length) {
    mount.innerHTML = '<div class="empty-state">Los registros de campo aparecerán aquí, organizados por lote y organismo.</div>';
    return;
  }
  const grupos = agrupar(registros);
  mount.innerHTML = `
    <div class="health-groups">
      ${grupos.map(({ actual, analisis, registros: serie }) => {
        const lote = lotes.find((item) => item.id === actual.lote_id);
        return `
          <article class="health-card">
            <div class="panel-header">
              <div>
                <span class="tag ${analisis.alerta ? 'tag-rust' : 'tag-brand'}">${analisis.alerta ? 'Umbral / tendencia' : 'Seguimiento'}</span>
                <h3>${escapeHtml(actual.agente)} · ${escapeHtml(lote?.nombre || 'Lote')}</h3>
                <p class="content-subtitle">${escapeHtml(TIPOS[actual.tipo] || actual.tipo)} · Diagnóstico: ${escapeHtml(DIAGNOSTICOS[actual.diagnostico] || actual.diagnostico)} · ${serie.length} observación(es)</p>
              </div>
              <button class="btn btn-ghost btn-small" data-accion="agregar" data-lote="${actual.lote_id}" data-agente="${escapeHtml(actual.agente)}">Añadir muestreo</button>
            </div>
            ${graficaIncidencia(serie)}
            ${renderAsociacionClima(store.analizarAsociacionClimaSanidad(finca.id, actual.lote_id, actual.agente))}
            <div class="health-current-values">
              <span><strong>Último dato:</strong> ${analisis.actual?.incidencia_pct === null || analisis.actual?.incidencia_pct === undefined ? 'Incidencia sin cuantificar' : `${analisis.actual.incidencia_pct}%`}</span>
              <span><strong>Umbral:</strong> ${analisis.umbral_control_pct === null ? 'No configurado' : `${analisis.umbral_control_pct}%`}</span>
              <span><strong>Severidad:</strong> ${escapeHtml(SEVERIDADES[actual.severidad] || actual.severidad)}</span>
            </div>
            ${analisis.proyeccion ? `<p class="content-subtitle">${escapeHtml(analisis.proyeccion.metodo)} · tendencia ${analisis.proyeccion.pendiente_pct_dia.toLocaleString('es-CO', { maximumFractionDigits: 3 })} puntos porcentuales/día${analisis.proyeccion.dias_hasta_umbral === null ? '' : ` · cruce lineal estimado en ${analisis.proyeccion.dias_hasta_umbral} días`}. No extrapola biología ni sustituye un diagnóstico.</p>` : `<p class="content-subtitle">${analisis.umbral_control_pct === null ? 'Configura un umbral respaldado por tu asistencia técnica para habilitar alertas de incidencia.' : 'Registra al menos tres muestreos con incidencia para estimar una tendencia descriptiva.'}</p>`}
            <div class="health-latest-observation">
              <span>${formatFecha(actual.fecha)} · ${escapeHtml(actual.etapa_cultivo || 'Etapa sin registrar')}</span>
              <span>${escapeHtml(actual.observaciones || 'Sin observaciones adicionales.')}</span>
              <span>${escapeHtml(actual.acciones || 'Sin acción registrada.')}</span>
            </div>
            <div class="health-record-list">
              ${serie.map((registro) => `
                <div class="health-record-row" data-id="${registro.id}">
                  <span>${formatFecha(registro.fecha)}</span>
                  <span>${registro.incidencia_pct === null ? '—' : `${registro.incidencia_pct}% incidencia`}</span>
                  <span>${escapeHtml(DIAGNOSTICOS[registro.diagnostico] || registro.diagnostico)} · ${escapeHtml(SEVERIDADES[registro.severidad] || registro.severidad)}</span>
                  <span class="row-actions"><button class="icon-btn" data-accion="editar">Editar</button><button class="icon-btn danger" data-accion="eliminar">Eliminar</button></span>
                </div>
              `).join('')}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
  mount.querySelectorAll('[data-accion="agregar"]').forEach((button) => {
    button.addEventListener('click', () => {
      const ultimo = grupos.find((grupo) => grupo.actual.lote_id === button.dataset.lote && grupo.actual.agente === button.dataset.agente)?.actual;
      formularioRegistro(finca, lotes, null, pintar, ultimo);
    });
  });
  mount.querySelectorAll('[data-accion="editar"]').forEach((button) => {
    button.addEventListener('click', () => {
      const registro = registros.find((item) => item.id === button.closest('[data-id]').dataset.id);
      formularioRegistro(finca, lotes, registro, pintar);
    });
  });
  mount.querySelectorAll('[data-accion="eliminar"]').forEach((button) => {
    button.addEventListener('click', () => {
      const registro = registros.find((item) => item.id === button.closest('[data-id]').dataset.id);
      if (!confirm(`¿Eliminar el monitoreo de ${registro.agente} del ${formatFecha(registro.fecha)}?`)) return;
      try {
        store.eliminarRegistroFitosanitario(registro.id);
        pintar();
        mostrarToast('Monitoreo eliminado');
      } catch (error) {
        mostrarToast(error.message);
      }
    });
  });
}

function renderAsociacionClima(analisis) {
  if (!analisis.disponible) {
    return `<div class="health-climate-association"><strong>Contexto climático</strong><p class="content-subtitle">${escapeHtml(analisis.motivo)}</p><a class="btn btn-ghost btn-small" href="#clima">Configurar datos climáticos</a></div>`;
  }
  const formato = (valor) => valor === null
    ? 'Muestra insuficiente o sin variación'
    : `${valor > 0 ? '+' : ''}${valor.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
  const senal = analisis.senales.length
    ? `<p class="health-climate-signal"><strong>Señal para priorizar un nuevo muestreo:</strong> la ventana climática reciente está en el cuartil superior histórico y coincide con una asociación positiva observada. No es un pronóstico ni confirma riesgo biológico.</p>`
    : '<p class="content-subtitle">No se detecta una señal exploratoria con los criterios mínimos definidos; esto no descarta riesgo fitosanitario.</p>';
  return `
    <div class="health-climate-association">
      <div class="panel-header"><div><h4>Clima relacionado con los monitoreos</h4><p class="content-subtitle">Asociación exploratoria · ventana de 7 días previa a cada observación</p></div><a class="btn btn-ghost btn-small" href="#clima">Ver clima</a></div>
      <p class="content-subtitle">Fuente más cercana con datos: <strong>${escapeHtml(analisis.fuente)}</strong> (${escapeHtml(analisis.proveedor)}) · ${analisis.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km · última observación ${formatFecha(analisis.fecha_clima_mas_reciente)}. Muestreos cuantificados: ${analisis.cantidad_muestreos}.</p>
      <div class="health-association-values">${analisis.asociacion.map((dato) => `<span>${escapeHtml(dato.etiqueta)}: <strong>r=${formato(dato.correlacion)}</strong> · ventanas válidas ${dato.n}/${analisis.cantidad_muestreos}</span>`).join('')}</div>
      ${senal}
      <p class="content-subtitle">La correlación no demuestra causalidad; depende de cobertura, representatividad espacial y calidad del muestreo. Interprétala con asistencia técnica local.</p>
    </div>
  `;
}

function graficaIncidencia(registros) {
  const datos = registros.filter((registro) => registro.incidencia_pct !== null).slice().reverse();
  if (!datos.length) return '<p class="empty-state">Todavía no hay mediciones de incidencia para graficar.</p>';
  const width = Math.max(360, datos.length * 56 + 56);
  const height = 145;
  const puntos = datos.map((registro, indice) => ({
    x: 30 + indice * ((width - 56) / Math.max(datos.length - 1, 1)),
    y: height - 28 - (registro.incidencia_pct / 100) * (height - 54),
    ...registro,
  }));
  return `
    <div class="health-chart-scroll">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Incidencia observada de ${escapeHtml(datos[0].agente)}">
        <line x1="28" y1="16" x2="28" y2="${height - 25}" stroke="var(--line-strong)" />
        <line x1="28" y1="${height - 25}" x2="${width - 12}" y2="${height - 25}" stroke="var(--line-strong)" />
        ${[0, 50, 100].map((valor) => {
          const y = height - 28 - (valor / 100) * (height - 54);
          return `<line x1="28" y1="${y}" x2="${width - 12}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 4" /><text x="23" y="${y + 3}" text-anchor="end" fill="var(--ink-soft)" font-size="9">${valor}%</text>`;
        }).join('')}
        <path d="${puntos.map((punto, indice) => `${indice ? 'L' : 'M'} ${punto.x} ${punto.y}`).join(' ')}" fill="none" stroke="var(--chart-warm)" stroke-width="3" stroke-linecap="round" />
        ${puntos.map((punto, indice) => `<circle cx="${punto.x}" cy="${punto.y}" r="4" fill="var(--chart-warm)" /><text x="${punto.x}" y="${height - 7}" text-anchor="middle" fill="var(--ink-soft)" font-size="9">${indice === 0 || indice === puntos.length - 1 ? escapeHtml(punto.fecha.slice(5)) : ''}</text>`).join('')}
      </svg>
    </div>
  `;
}

function formularioRegistro(finca, lotes, editar, alGuardar, referencia = null) {
  const registro = editar || {};
  const loteId = registro.lote_id || referencia?.lote_id || lotes[0]?.id;
  const agente = registro.agente || referencia?.agente || '';
  const umbralActual = registro.umbral_control_pct ?? referencia?.umbral_control_pct ?? '';
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Lote
      <select name="lote_id" required>${lotes.map((lote) => `<option value="${lote.id}" ${lote.id === loteId ? 'selected' : ''}>${escapeHtml(lote.nombre)}</option>`).join('')}</select>
    </label>
    <div class="form-row">
      <label>Fecha del muestreo <input type="date" name="fecha" value="${registro.fecha || hoyISO()}" required /></label>
      <label>Tipo
        <select name="tipo">${Object.entries(TIPOS).map(([valor, texto]) => `<option value="${escapeHtml(valor)}" ${registro.tipo === valor ? 'selected' : ''}>${escapeHtml(texto)}</option>`).join('')}</select>
      </label>
    </div>
    <label>Plaga, enfermedad o síntoma
      <input name="agente" required minlength="2" value="${escapeHtml(agente)}" placeholder="Ej. broca del café, roya, mancha por identificar" />
    </label>
    <div class="form-row-3">
      <label>Diagnóstico
        <select name="diagnostico">${Object.entries(DIAGNOSTICOS).map(([valor, texto]) => `<option value="${escapeHtml(valor)}" ${registro.diagnostico === valor ? 'selected' : ''}>${escapeHtml(texto)}</option>`).join('')}</select>
      </label>
      <label>Severidad
        <select name="severidad">${Object.entries(SEVERIDADES).map(([valor, texto]) => `<option value="${escapeHtml(valor)}" ${registro.severidad === valor ? 'selected' : ''}>${escapeHtml(texto)}</option>`).join('')}</select>
      </label>
      <label>Etapa del cultivo <input name="etapa_cultivo" value="${escapeHtml(registro.etapa_cultivo || '')}" placeholder="Floración, llenado…" /></label>
    </div>
    <div class="form-row">
      <label>Incidencia observada (%)
        <input name="incidencia_pct" type="number" min="0" max="100" step="0.1" value="${registro.incidencia_pct ?? ''}" placeholder="Solo si se cuantificó" />
      </label>
      <label>Umbral de seguimiento propio (%)
        <input name="umbral_control_pct" type="number" min="0" max="100" step="0.1" value="${umbralActual}" placeholder="Validado para este lote" />
      </label>
    </div>
    <label>Observaciones de campo <textarea name="observaciones" rows="3" placeholder="Distribución, síntomas, plantas evaluadas, condiciones encontradas…">${escapeHtml(registro.observaciones || '')}</textarea></label>
    <label>Acciones realizadas o acordadas <textarea name="acciones" rows="2" placeholder="Re-muestreo, consulta técnica, labor programada…">${escapeHtml(registro.acciones || '')}</textarea></label>
    <p class="content-subtitle">El umbral debe corresponder al método de muestreo y a una recomendación técnica aplicable a tu zona y etapa del cultivo. No hay un umbral genérico precargado.</p>
    <div class="form-actions"><button class="btn btn-primary" type="submit">${editar ? 'Guardar cambios' : 'Guardar monitoreo'}</button></div>
  `;
  const cerrar = abrirModal(editar ? 'Editar monitoreo fitosanitario' : 'Registrar monitoreo fitosanitario', form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const datos = {
      finca_id: finca.id,
      lote_id: fd.get('lote_id'),
      fecha: fd.get('fecha'),
      agente: fd.get('agente'),
      tipo: fd.get('tipo'),
      diagnostico: fd.get('diagnostico'),
      severidad: fd.get('severidad'),
      etapa_cultivo: fd.get('etapa_cultivo'),
      incidencia_pct: fd.get('incidencia_pct'),
      umbral_control_pct: fd.get('umbral_control_pct'),
      observaciones: fd.get('observaciones'),
      acciones: fd.get('acciones'),
    };
    try {
      if (editar) store.actualizarRegistroFitosanitario(editar.id, datos);
      else store.crearRegistroFitosanitario(datos);
      cerrar();
      alGuardar();
      mostrarToast(editar ? 'Monitoreo actualizado' : 'Monitoreo guardado');
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}
