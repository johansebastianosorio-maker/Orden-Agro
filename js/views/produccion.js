import * as store from '../store.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { escapeHtml } from '../format.js';

const UNIDADES = {
  kg_pergamino_seco: 'kg de café pergamino seco',
  kg_cereza: 'kg de café cereza',
  kg_otro: 'kg (otra presentación)',
};

export function render(mount, finca) {
  mount.innerHTML = `
    <section class="panel" style="margin-bottom:20px;">
      <div class="panel-header">
        <div>
          <h2>Referencia de producción para la finca</h2>
          <p class="content-subtitle">Suma de referencias por lote, separadas por presentación.</p>
        </div>
      </div>
      <div id="proyeccion-finca"></div>
    </section>
    <section class="panel" style="margin-bottom:20px;">
      <div class="panel-header">
        <div>
          <h2>Producción por lote</h2>
          <p class="content-subtitle">Registra el resultado real de cada campaña. La unidad debe ser la misma para comparar años; no convertimos entre cereza, pergamino y café verde.</p>
        </div>
        <button id="btn-nueva-cosecha" class="btn btn-primary btn-small">Registrar cosecha</button>
      </div>
      <label style="max-width:440px;">Lote a analizar
        <select id="select-lote-produccion"></select>
      </label>
      <label style="max-width:440px;">Presentación para analizar
        <select id="select-unidad-produccion"></select>
      </label>
      <div id="proyeccion-lote"></div>
      <div id="grafica-produccion"></div>
      <div id="tabla-produccion"></div>
    </section>
    <section class="panel">
      <h2>Cómo completar la información del lote</h2>
      <p class="content-subtitle" style="margin-top:8px;">En <a href="#lotes" style="color:var(--brand);text-decoration:underline;">Mapas y lotes</a> registra cultivo, variedad, edad, área y distancias de siembra. El conteo por distancias es una aproximación geométrica, no un conteo real de árboles.</p>
      <p class="content-subtitle">La referencia es una línea base descriptiva del historial de ese lote, no un modelo calibrado ni una promesa de cosecha. No ajusta por clima, fenología, edad, manejo ni alternancia productiva.</p>
    </section>
  `;

  const select = mount.querySelector('#select-lote-produccion');
  const selectUnidad = mount.querySelector('#select-unidad-produccion');
  const lotes = store.listarLotes(finca.id);
  select.innerHTML = lotes.map((lote) => `<option value="${lote.id}">${escapeHtml(lote.nombre)} · ${escapeHtml(lote.cultivo || 'cultivo sin especificar')}</option>`).join('');
  mount.querySelector('#proyeccion-finca').innerHTML = resumenFinca(store.proyectarProduccionFinca(finca.id));
  mount.querySelector('#btn-nueva-cosecha').disabled = lotes.length === 0;
  mount.querySelector('#btn-nueva-cosecha').addEventListener('click', () => {
    if (!lotes.length) {
      mostrarToast('Primero registra un lote.');
      return;
    }
    formularioCosecha(finca, null, pintar);
  });
  select.addEventListener('change', pintar);
  pintar();

  function pintar() {
    const loteId = select.value;
    const cosechas = store.listarCosechas(finca.id, loteId);
    const unidades = [...new Set(cosechas.map((cosecha) => cosecha.unidad_producto))];
    const unidadAnterior = selectUnidad.value;
    selectUnidad.innerHTML = unidades.length
      ? unidades.map((unidad) => `<option value="${escapeHtml(unidad)}">${escapeHtml(UNIDADES[unidad] || unidad)}</option>`).join('')
      : '<option value="">Sin presentaciones registradas</option>';
    selectUnidad.disabled = unidades.length === 0;
    selectUnidad.value = unidades.includes(unidadAnterior)
      ? unidadAnterior
      : unidades.includes('kg_pergamino_seco') ? 'kg_pergamino_seco' : (unidades[0] || '');
    const proyeccion = loteId
      ? store.proyectarCosechaLote(finca.id, loteId, selectUnidad.value || null)
      : null;
    renderProyeccion(mount.querySelector('#proyeccion-lote'), proyeccion);
    renderGrafica(mount.querySelector('#grafica-produccion'), proyeccion?.cosechas || [], proyeccion);
    renderTabla(mount.querySelector('#tabla-produccion'), cosechas, pintar, finca);
  }

  selectUnidad.addEventListener('change', pintar);
}

function resumenFinca(resumen) {
  const lotesIncluidos = resumen.porUnidad.reduce((suma, grupo) => suma + grupo.lotes.length, 0);
  if (!lotesIncluidos) {
    return `<div class="empty-state">${resumen.lotesSinDatosComparables ? 'Hay cosechas registradas, pero sus cultivos, variedades o presentaciones no coinciden con los datos actuales de los lotes. Revísalos para calcular referencias.' : 'Aún no hay historiales de cosecha. Registra campañas por lote para crear una referencia.'}</div>`;
  }
  return `
    <div class="grid-2">
      ${resumen.porUnidad.map((grupo) => `
        <article class="kpi-card">
          <p class="kpi-label">Referencia total · ${escapeHtml(grupo.cultivo)} · ${escapeHtml(grupo.variedad)} · ${escapeHtml(UNIDADES[grupo.unidad_producto] || grupo.unidad_producto)}</p>
          <p class="kpi-value tabular">${grupo.produccion_central_kg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg</p>
          <p class="content-subtitle">${grupo.lotes.length} de ${resumen.totalLotes} lotes con datos comparables. Referencia por lote ajustada al área productiva registrada.</p>
        </article>
      `).join('')}
    </div>
    ${resumen.lotesSinHistorial ? `<p class="content-subtitle" style="margin-top:12px;">${resumen.lotesSinHistorial} lote(s) no se incluyen por falta de historial.</p>` : ''}
    ${resumen.lotesSinDatosComparables ? `<p class="content-subtitle" style="margin-top:12px;">${resumen.lotesSinDatosComparables} lote(s) tienen cosechas que no coinciden con el cultivo, variedad o presentación actuales.</p>` : ''}
  `;
}

function renderProyeccion(mount, resultado) {
  if (!resultado) {
    mount.innerHTML = '<div class="empty-state">Crea un lote y registra al menos una cosecha para estimar una referencia.</div>';
    return;
  }
  if (!resultado.proyeccion) {
    mount.innerHTML = `<div class="empty-state">${resultado.historial_cosechas ? 'No hay campañas compatibles con el cultivo, variedad y presentación seleccionados. Revisa los datos del lote o registra cosechas comparables.' : 'No hay cosechas registradas para este lote. Agrega resultados reales para construir una referencia.'}</div>`;
    return;
  }
  const p = resultado.proyeccion;
  const kg = (valor) => `${Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg`;
  mount.innerHTML = `
    <div class="panel" style="background:var(--brand-soft);border-color:var(--brand-light);margin:12px 0;">
      <div class="panel-header">
        <h3>Estimación de referencia para campaña ${p.campania}</h3>
        <span class="tag tag-brand">${p.numero_campanias} campaña(s) observada(s)</span>
      </div>
      <div class="kpi-row">
        <div class="kpi-card"><p class="kpi-label">Rendimiento central (mediana)</p><p class="kpi-value tabular">${kg(p.rendimiento_central_kg_ha)} /ha</p></div>
        <div class="kpi-card"><p class="kpi-label">Producción total de referencia</p><p class="kpi-value tabular">${kg(p.produccion_central_kg)}</p></div>
        <div class="kpi-card"><p class="kpi-label">Área usada</p><p class="kpi-value tabular">${resultado.area_proyectada_ha.toLocaleString('es-CO', { maximumFractionDigits: 2 })} ha</p></div>
      </div>
      ${p.produccion_observada_min_kg === null ? '<p class="content-subtitle">Solo hay una campaña comparable; no permite estimar variabilidad entre campañas.</p>' : `<p class="content-subtitle">Rango de escenarios observado en las últimas ${p.campanias_modeladas} campañas: ${kg(p.produccion_observada_min_kg)}–${kg(p.produccion_observada_max_kg)}. No es un intervalo de confianza ni garantiza el resultado futuro.</p>`}
      <p class="content-subtitle"><strong>Método:</strong> ${p.metodo === 'tendencia_lineal_amortiguada_acotada' ? 'promedio ponderado de hasta cinco campañas recientes con la mitad de la tendencia lineal amortiguada y limitada al rango observado.' : 'mediana histórica, porque todavía hay menos de tres campañas comparables.'}${p.error_absoluto_porcentual_validacion_pct === null ? '' : ` Error porcentual absoluto medio de validación retrospectiva: ${p.error_absoluto_porcentual_validacion_pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })}% (${p.numero_campanias - 3} comparación(es) disponible(s)); la muestra es pequeña.`}</p>
      ${p.produccion_por_arbol_kg === null ? '' : `<p class="content-subtitle">Referencia calculada: ${kg(p.produccion_por_arbol_kg)} por árbol productivo registrado.</p>`}
      <p class="content-subtitle"><strong>Lectura responsable:</strong> la ficha separa cultivo, variedad y presentación; el método utiliza rendimientos históricos y el área productiva actual. Aún no incorpora clima, floración, carga de frutos ni manejo, y no es un pronóstico agronómico validado.</p>
    </div>
  `;
}

function renderGrafica(mount, cosechas, resultado) {
  if (!cosechas.length) {
    mount.innerHTML = '<div class="empty-state" style="margin:12px 0;">No hay campañas comparables para graficar con esta presentación, cultivo y variedad.</div>';
    return;
  }

  const unidad = resultado.unidad_producto || cosechas[0].unidad_producto;
  const registros = cosechas.filter((cosecha) => cosecha.unidad_producto === unidad);
  const datos = registros.map((cosecha) => ({
    campania: cosecha.campania,
    rendimiento: cosecha.produccion_kg / cosecha.area_cosechada_ha,
  })).sort((a, b) => a.campania - b.campania);
  const proyeccion = resultado?.proyeccion;
  const ancho = Math.max(460, (datos.length + (proyeccion ? 1 : 0)) * 90 + 100);
  const alto = 250;
  const rendimientos = datos.map((dato) => dato.rendimiento);
  if (proyeccion) {
    rendimientos.push(proyeccion.rendimiento_central_kg_ha);
    if (proyeccion.rendimiento_observado_max_kg_ha !== null) rendimientos.push(proyeccion.rendimiento_observado_max_kg_ha);
  }
  const maximo = Math.max(...rendimientos, 1);
  const puntos = datos.map((dato, indice) => {
    const x = 54 + indice * ((ancho - 108) / Math.max(datos.length - 1, 1));
    const y = alto - 44 - (dato.rendimiento / maximo) * (alto - 92);
    return { ...dato, x, y };
  });
  const path = puntos.map((punto, indice) => `${indice ? 'L' : 'M'} ${punto.x} ${punto.y}`).join(' ');
  const xPronostico = proyeccion ? 54 + datos.length * ((ancho - 108) / Math.max(datos.length, 1)) : null;
  const yPronostico = proyeccion ? alto - 44 - (proyeccion.rendimiento_central_kg_ha / maximo) * (alto - 92) : null;
  const yMin = proyeccion?.rendimiento_observado_min_kg_ha !== null && proyeccion
    ? alto - 44 - (proyeccion.rendimiento_observado_min_kg_ha / maximo) * (alto - 92) : null;
  const yMax = proyeccion?.rendimiento_observado_max_kg_ha !== null && proyeccion
    ? alto - 44 - (proyeccion.rendimiento_observado_max_kg_ha / maximo) * (alto - 92) : null;
  const bandaEscenarios = yMin !== null && yMax !== null
    ? `<rect x="${xPronostico - 12}" y="${yMax}" width="24" height="${Math.max(yMin - yMax, 2)}" rx="5" fill="var(--chart-cold)" opacity=".14" />`
    : '';

  mount.innerHTML = `
    <div style="overflow-x:auto;margin:10px 0 20px;">
      <svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Rendimiento observado por campaña">
        <title>Rendimiento cosechado por campaña</title>
        <desc>Producción dividida por área cosechada, expresada en ${escapeHtml(UNIDADES[unidad])} por hectárea. No es una proyección.</desc>
        <line x1="48" y1="20" x2="48" y2="${alto - 38}" stroke="var(--line-strong)" />
        <line x1="48" y1="${alto - 38}" x2="${ancho - 20}" y2="${alto - 38}" stroke="var(--line-strong)" />
        ${[0, 0.5, 1].map((fraction) => {
          const y = alto - 38 - fraction * (alto - 82);
          const label = Math.round(maximo * fraction).toLocaleString('es-CO');
          return `<line x1="48" y1="${y}" x2="${ancho - 20}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 5" /><text x="42" y="${y + 4}" text-anchor="end" fill="var(--ink-soft)" font-size="11">${label}</text>`;
        }).join('')}
        <path d="${path}" fill="none" stroke="var(--chart-leaf)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${puntos.map((punto) => `<circle cx="${punto.x}" cy="${punto.y}" r="5" fill="var(--chart-leaf)" stroke="var(--surface)" stroke-width="2" /><text x="${punto.x}" y="${punto.y - 12}" text-anchor="middle" fill="var(--ink)" font-size="11">${Math.round(punto.rendimiento).toLocaleString('es-CO')}</text><text x="${punto.x}" y="${alto - 16}" text-anchor="middle" fill="var(--ink-soft)" font-size="12">${punto.campania}</text>`).join('')}
        ${proyeccion ? `${bandaEscenarios}<line x1="${xPronostico}" y1="${yPronostico}" x2="${xPronostico}" y2="${alto - 38}" stroke="var(--chart-cold)" stroke-dasharray="4 4" /><circle cx="${xPronostico}" cy="${yPronostico}" r="6" fill="var(--chart-cold)" stroke="var(--surface)" stroke-width="2" /><text x="${xPronostico}" y="${yPronostico - 12}" text-anchor="middle" fill="var(--chart-cold)" font-size="11">${Math.round(proyeccion.rendimiento_central_kg_ha).toLocaleString('es-CO')}</text><text x="${xPronostico}" y="${alto - 16}" text-anchor="middle" fill="var(--chart-cold)" font-size="12">${proyeccion.campania} est.</text>${yMin !== null && yMax !== null ? `<line x1="${xPronostico}" y1="${yMax}" x2="${xPronostico}" y2="${yMin}" stroke="var(--chart-cold)" stroke-width="2" />` : ''}` : ''}
      </svg>
    </div>
    <p class="content-subtitle">Rendimiento en ${escapeHtml(UNIDADES[unidad])}/ha. Verde: cosechas registradas · azul punteado: estimación de tendencia amortiguada · banda: rango observado, no intervalo de confianza.</p>
  `;
}

function renderTabla(mount, cosechas, pintar, finca) {
  if (!cosechas.length) {
    mount.innerHTML = '';
    return;
  }
  mount.innerHTML = `
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Campaña</th><th>Variedad registrada</th><th>Presentación</th><th class="num">Producción</th><th class="num">Área cosechada</th><th class="num">Rendimiento</th><th>Observaciones</th><th></th></tr></thead>
        <tbody>
          ${cosechas.map((cosecha) => `
            <tr data-id="${cosecha.id}">
              <td>${cosecha.campania}</td><td>${escapeHtml(cosecha.variedad || 'Sin especificar')}</td>
              <td>${escapeHtml(UNIDADES[cosecha.unidad_producto])}</td>
              <td class="num">${Number(cosecha.produccion_kg).toLocaleString('es-CO')} kg</td>
              <td class="num">${Number(cosecha.area_cosechada_ha).toLocaleString('es-CO')} ha</td>
              <td class="num">${(cosecha.produccion_kg / cosecha.area_cosechada_ha).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg/ha</td>
              <td>${escapeHtml(cosecha.observaciones || '—')}</td>
              <td class="row-actions"><button class="icon-btn" data-accion="editar">Editar</button><button class="icon-btn danger" data-accion="eliminar">Eliminar</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  mount.querySelectorAll('[data-accion="editar"]').forEach((button) => {
    button.addEventListener('click', () => {
      const cosecha = cosechas.find((c) => c.id === button.closest('tr').dataset.id);
      formularioCosecha(finca, cosecha, pintar);
    });
  });
  mount.querySelectorAll('[data-accion="eliminar"]').forEach((button) => {
    button.addEventListener('click', () => {
      const cosecha = cosechas.find((c) => c.id === button.closest('tr').dataset.id);
      if (!confirm(`¿Eliminar la cosecha de la campaña ${cosecha.campania}?`)) return;
      try {
        store.eliminarCosecha(cosecha.id);
        pintar();
        mostrarToast('Cosecha eliminada');
      } catch (error) {
        mostrarToast(error.message);
      }
    });
  });
}

function formularioCosecha(finca, editar, alGuardar) {
  const lotes = store.listarLotes(finca.id);
  const variedadInicial = editar?.variedad || lotes.find((lote) => lote.id === editar?.lote_id)?.variedad || lotes[0]?.variedad || '';
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Lote
      <select name="lote_id" required>${lotes.map((lote) => `<option value="${lote.id}" ${editar?.lote_id === lote.id ? 'selected' : ''}>${escapeHtml(lote.nombre)}</option>`).join('')}</select>
    </label>
    <div class="form-row">
      <label>Año de campaña
        <input name="campania" type="number" min="2000" max="${new Date().getFullYear()}" step="1" value="${editar?.campania ?? new Date().getFullYear()}" required />
      </label>
      <label>Presentación del producto
        <select name="unidad_producto">${Object.entries(UNIDADES).map(([valor, texto]) => `<option value="${valor}" ${editar?.unidad_producto === valor || (!editar && valor === 'kg_pergamino_seco') ? 'selected' : ''}>${escapeHtml(texto)}</option>`).join('')}</select>
      </label>
    </div>
    <label>Variedad cosechada
      <input name="variedad" value="${escapeHtml(variedadInicial)}" placeholder="Debe coincidir con la variedad del lote para comparar" />
    </label>
    <div class="form-row">
      <label>Producción total cosechada (kg)
        <input name="produccion_kg" type="number" min="0.01" step="0.01" value="${editar?.produccion_kg ?? ''}" required />
      </label>
      <label>Área cosechada (ha)
        <input name="area_cosechada_ha" type="number" min="0.01" step="0.01" value="${editar?.area_cosechada_ha ?? ''}" required />
      </label>
    </div>
    <label>Notas para interpretar este dato
      <textarea name="observaciones" rows="2">${editar ? escapeHtml(editar.observaciones) : ''}</textarea>
    </label>
    <p class="content-subtitle">Registra el total final de una campaña y anota la presentación exacta del café. No mezcles cereza, pergamino seco y café verde en la misma serie.</p>
    <div class="form-actions"><button type="submit" class="btn btn-primary">${editar ? 'Guardar cambios' : 'Guardar cosecha'}</button></div>
  `;
  const loteSelect = form.querySelector('[name="lote_id"]');
  const areaInput = form.querySelector('[name="area_cosechada_ha"]');
  if (!editar && loteSelect.value) {
    const lote = lotes.find((item) => item.id === loteSelect.value);
    areaInput.value = lote?.area_ha || '';
  }
  loteSelect.addEventListener('change', () => {
    const lote = lotes.find((item) => item.id === loteSelect.value);
    if (!editar && lote) areaInput.value = lote.area_ha;
  });
  const cerrar = abrirModal(editar ? 'Editar cosecha' : 'Registrar cosecha', form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const datos = {
      finca_id: finca.id, lote_id: fd.get('lote_id'), campania: fd.get('campania'),
      unidad_producto: fd.get('unidad_producto'), produccion_kg: fd.get('produccion_kg'),
      area_cosechada_ha: fd.get('area_cosechada_ha'), observaciones: fd.get('observaciones'),
      variedad: fd.get('variedad'),
    };
    try {
      if (editar) store.actualizarCosecha(editar.id, datos);
      else store.crearCosecha(datos);
      cerrar();
      alGuardar();
      mostrarToast(editar ? 'Cosecha actualizada' : 'Cosecha guardada');
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}
