import * as store from '../store.js';
import { abrirModal, mostrarToast } from '../modal.js';
import { escapeHtml, formatFecha } from '../format.js';
import { consultarClimaNASA } from '../weather.js';

const PLANTILLA = 'fecha,lluvia_mm,temp_min_c,temp_max_c,humedad_pct,viento_ms\n2026-01-31,12.5,18.2,26.4,78,1.8\n';

export function render(mount, finca) {
  const lotes = store.listarLotes(finca.id);
  const hastaInicial = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const desdeInicial = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  mount.innerHTML = `
    <section class="panel climate-source-panel">
      <div class="panel-header">
        <div>
          <span class="eyebrow">DATOS CLIMÁTICOS GEOREFERENCIADOS</span>
          <h2>Consultar grilla climática NASA POWER</h2>
          <p class="content-subtitle">Precipitación, temperatura, humedad y viento diarios para la ubicación elegida.</p>
        </div>
        <span class="tag tag-finance">Histórico / casi en tiempo real</span>
      </div>
      <form id="form-consulta-nasa">
        <div class="form-row-3">
          <label>Lote o ubicación
            <select name="lote_id">
              ${lotes.map((lote) => `<option value="${lote.id}">${escapeHtml(lote.nombre)}</option>`).join('')}
              ${lotes.length ? '<option value="">Centro GPS de la finca</option>' : '<option value="">Centro GPS de la finca</option>'}
            </select>
          </label>
          <label>Desde <input name="desde" type="date" value="${desdeInicial}" max="${hastaInicial}" required /></label>
          <label>Hasta <input name="hasta" type="date" value="${hastaInicial}" max="${hastaInicial}" required /></label>
        </div>
        <div class="weather-consent">
          <strong>Antes de consultar:</strong> al pulsar el botón se enviarán las coordenadas del lote a la API pública NASA POWER. Los datos son estimaciones en una grilla de reanálisis, no mediciones de una estación ni un pronóstico futuro. No se transmite el nombre de la finca.
        </div>
        <div class="form-actions"><button id="btn-consultar-nasa" type="submit" class="btn btn-primary">Consultar y guardar datos</button></div>
        <p id="estado-consulta-nasa" class="content-subtitle" role="status" aria-live="polite"></p>
      </form>
      <p class="content-subtitle nasa-attribution">Fuente: NASA POWER Daily API; meteorología basada principalmente en MERRA-2, grilla nativa aproximada 0,5° × 0,625°. <a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA POWER</a> · UTC · valores faltantes no se interpretan como cero.</p>
    </section>
    <section class="panel" style="margin-bottom:20px;">
      <div class="panel-header">
        <div>
          <h2>Clima observado cerca de la finca</h2>
          <p class="content-subtitle">Compara estaciones observadas con series de grilla. Una grilla o estación cercana no necesariamente representa el microclima del cultivo.</p>
        </div>
        <button id="btn-nueva-estacion" class="btn btn-primary btn-small">Agregar estación observada</button>
      </div>
      <label style="max-width:440px;">Lote de referencia
        <select id="select-lote-clima">
          ${lotes.map((lote) => `<option value="${lote.id}">${escapeHtml(lote.nombre)}</option>`).join('')}
          ${lotes.length ? '' : '<option value="">Ubicación general de finca</option>'}
        </select>
      </label>
      <div id="resumen-clima"></div>
      <div id="grafica-clima"></div>
    </section>
    <section class="panel" style="margin-bottom:20px;">
      <div class="panel-header">
        <div>
          <h2>Fuentes climáticas registradas</h2>
          <p class="content-subtitle">Agrega estaciones oficiales del IDEAM, Comité de Cafeteros u otras redes; conserva el nombre y la fuente original.</p>
        </div>
      </div>
      <div id="tabla-estaciones"></div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Observaciones diarias importadas</h2>
          <p class="content-subtitle">Se guarda la estación de origen. Las observaciones no se interpolan y no son un pronóstico.</p>
        </div>
        <button id="btn-descargar-plantilla" class="btn btn-ghost btn-small">Descargar plantilla CSV</button>
      </div>
      <div id="tabla-observaciones"></div>
    </section>
    <input id="archivo-clima" class="hidden" type="file" accept=".csv,text/csv" />
  `;

  const selectorLote = mount.querySelector('#select-lote-clima');
  let estacionParaImportar = null;
  const archivoInput = mount.querySelector('#archivo-clima');
  const formNASA = mount.querySelector('#form-consulta-nasa');
  formNASA.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(formNASA);
    const boton = formNASA.querySelector('#btn-consultar-nasa');
    const estado = formNASA.querySelector('#estado-consulta-nasa');
    const referenciaGPS = store.coordenadasClima(finca.id, fd.get('lote_id') || null);
    if (!referenciaGPS) {
      mostrarToast('Este lote no tiene puntos GPS. Captura su ubicación en Mapas y lotes antes de consultar.');
      return;
    }
    const desde = String(fd.get('desde'));
    const hasta = String(fd.get('hasta'));
    const inicio = Date.parse(`${desde}T00:00:00Z`);
    const fin = Date.parse(`${hasta}T00:00:00Z`);
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || inicio > fin) {
      mostrarToast('Revisa el periodo: la fecha inicial no puede superar la final.');
      return;
    }
    if ((fin - inicio) / 86400000 > 365) {
      mostrarToast('Consulta un máximo de 366 días por solicitud.');
      return;
    }
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 30000);
    boton.disabled = true;
    boton.textContent = 'Consultando NASA POWER…';
    estado.textContent = 'Enviando únicamente las coordenadas y el periodo solicitado.';
    try {
      const datos = await consultarClimaNASA({
        lat: referenciaGPS.lat, lng: referenciaGPS.lng, desde, hasta, signal: controlador.signal,
      });
      const resultado = store.guardarSerieClimaNASA(finca.id, datos, referenciaGPS.referencia);
      estado.textContent = `${resultado.insertadas} días nuevos y ${resultado.actualizadas} actualizados · ${datos.fuente} · ${datos.resolucion}`;
      mostrarToast('Datos climáticos descargados y guardados');
      pintar();
    } catch (error) {
      estado.textContent = `No se completó la consulta: ${error.message}`;
      mostrarToast(error.message);
    } finally {
      clearTimeout(temporizador);
      boton.disabled = false;
      boton.textContent = 'Consultar y guardar datos';
    }
  });
  mount.querySelector('#btn-nueva-estacion').addEventListener('click', () => formularioEstacion(finca, null, pintar));
  mount.querySelector('#btn-descargar-plantilla').addEventListener('click', descargarPlantilla);
  selectorLote.addEventListener('change', pintarResumen);
  archivoInput.addEventListener('change', async () => {
    const archivo = archivoInput.files?.[0];
    const estacion = store.listarEstacionesClima(finca.id).find((item) => item.id === estacionParaImportar);
    if (!archivo || !estacion) return;
    try {
      const texto = (await archivo.text()).replace(/^\uFEFF/, '');
      const filas = parsearCSV(texto);
      const resultado = store.importarObservacionesClima(estacion.id, filas);
      mostrarToast(`Importación terminada: ${resultado.insertadas} nuevas, ${resultado.actualizadas} actualizadas.`);
      pintar();
    } catch (error) {
      mostrarToast(`No se pudo importar el archivo: ${error.message}`);
    } finally {
      archivoInput.value = '';
      estacionParaImportar = null;
    }
  });

  function pintar() {
    pintarResumen();
    pintarEstaciones();
    pintarObservaciones();
  }

  function pintarResumen() {
    const lote = lotes.find((item) => item.id === selectorLote.value) || null;
    const estacion = store.estacionMasCercana(finca.id, lote?.id || null);
    const mountResumen = mount.querySelector('#resumen-clima');
    const mountGrafica = mount.querySelector('#grafica-clima');
    if (!estacion) {
      mountResumen.innerHTML = `
        <div class="empty-state">
          ${finca.origen_gps || lotes.some((item) => (item.poligono || []).some((punto) => punto.lat !== null && punto.lat !== undefined && punto.lng !== null && punto.lng !== undefined && Number.isFinite(Number(punto.lat)) && Number.isFinite(Number(punto.lng)))) ? 'Agrega una estación IDEAM o consulta la grilla NASA POWER.' : 'No hay ubicación GPS de la finca o del lote. Ve a Mapas y lotes para capturar un punto.'}
        </div>`;
      mountGrafica.innerHTML = '';
      return;
    }
    const observaciones = store.listarObservacionesClima(estacion.id);
    const ultima = observaciones[0] || null;
    mountResumen.innerHTML = `
      <div class="panel" style="background:var(--finance-soft);border-color:var(--line);margin:12px 0;">
        <div class="panel-header">        <h3>Fuente geográfica más cercana</h3><span class="tag tag-finance">Fuente: ${escapeHtml(estacion.proveedor)}</span></div>
        <p><strong>${escapeHtml(estacion.nombre)}</strong> · código ${escapeHtml(estacion.codigo)}</p>
        <p class="content-subtitle">Distancia aproximada al punto del lote: ${estacion.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km · Altitud de estación: ${estacion.altitud_m ?? 'sin dato'} m · Coordenadas: ${estacion.lat}, ${estacion.lng}</p>
        ${lote?.altitud_m && estacion.altitud_m ? `<p class="content-subtitle">Diferencia de altitud con lote: ${Math.abs(lote.altitud_m - estacion.altitud_m).toLocaleString('es-CO')} m.</p>` : ''}
        ${ultima ? `
          <div class="kpi-row">
            ${indicador('Último registro', formatFecha(ultima.fecha))}
            ${indicador('Lluvia', ultima.lluvia_mm === null ? 'Sin dato' : `${ultima.lluvia_mm} mm`)}
            ${indicador('Temperatura mín. / máx.', ultima.temp_min_c === null && ultima.temp_max_c === null ? 'Sin dato' : `${ultima.temp_min_c ?? '—'}° / ${ultima.temp_max_c ?? '—'}°C`)}
            ${indicador('Humedad relativa', ultima.humedad_pct === null ? 'Sin dato' : `${ultima.humedad_pct}%`)}
          </div>
        ` : '<p class="content-subtitle">Esta fuente aún no tiene observaciones diarias.</p>'}
      </div>
      <p class="content-subtitle"><strong>Representatividad:</strong> la distancia y el relieve importan. NASA POWER representa una celda de grilla y no un pluviómetro instalado en el lote; no combines sus valores con estaciones como si fueran la misma clase de medición.</p>
    `;
    renderGraficaClima(mountGrafica, observaciones, estacion.proveedor);
  }

  function pintarEstaciones() {
    const contenedor = mount.querySelector('#tabla-estaciones');
    const filas = store.listarEstacionesClima(finca.id);
    if (!filas.length) {
      contenedor.innerHTML = '<div class="empty-state">Aún no hay fuentes climáticas. Consulta NASA POWER o agrega manualmente una estación IDEAM identificada en una fuente oficial.</div>';
      return;
    }
    contenedor.innerHTML = `
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Fuente</th><th>Código</th><th>Estación</th><th>Latitud / longitud</th><th class="num">Altitud</th><th class="num">Registros</th><th></th></tr></thead>
          <tbody>${filas.map((estacion) => `
            <tr data-id="${estacion.id}">
              <td>${escapeHtml(estacion.proveedor)}</td><td>${escapeHtml(estacion.codigo)}</td><td>${escapeHtml(estacion.nombre)}</td>
              <td>${estacion.lat}, ${estacion.lng}</td><td class="num">${estacion.altitud_m ?? '—'} m</td>
              <td class="num">${store.listarObservacionesClima(estacion.id).length}</td>
              <td class="row-actions">
                <button class="icon-btn" data-accion="importar">Importar CSV</button>
                <button class="icon-btn" data-accion="editar">Editar</button>
                <button class="icon-btn danger" data-accion="eliminar">Eliminar</button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;
    contenedor.querySelectorAll('[data-accion="importar"]').forEach((button) => {
      button.addEventListener('click', () => {
        estacionParaImportar = button.closest('tr').dataset.id;
        archivoInput.click();
      });
    });
    contenedor.querySelectorAll('[data-accion="editar"]').forEach((button) => {
      button.addEventListener('click', () => {
        const estacion = filas.find((item) => item.id === button.closest('tr').dataset.id);
        formularioEstacion(finca, estacion, pintar);
      });
    });
    contenedor.querySelectorAll('[data-accion="eliminar"]').forEach((button) => {
      button.addEventListener('click', () => {
        const estacion = filas.find((item) => item.id === button.closest('tr').dataset.id);
        if (!confirm(`¿Eliminar la estación ${estacion.nombre}?`)) return;
        try {
          store.eliminarEstacionClima(estacion.id);
          pintar();
          mostrarToast('Estación eliminada');
        } catch (error) {
          mostrarToast(error.message);
        }
      });
    });
  }

  function pintarObservaciones() {
    const contenedor = mount.querySelector('#tabla-observaciones');
    const estacionesActuales = store.listarEstacionesClima(finca.id);
    const observaciones = estacionesActuales.flatMap((estacion) =>
      store.listarObservacionesClima(estacion.id).map((observacion) => ({ ...observacion, estacion })),
    ).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!observaciones.length) {
      contenedor.innerHTML = '<div class="empty-state">No hay observaciones climáticas. Descarga la plantilla, completa datos del IDEAM y cárgalos en la estación correspondiente.</div>';
      return;
    }
    contenedor.innerHTML = `
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Fecha</th><th>Estación</th><th class="num">Lluvia</th><th class="num">Temp. mín.</th><th class="num">Temp. máx.</th><th class="num">Humedad</th><th class="num">Viento</th><th></th></tr></thead>
          <tbody>${observaciones.map((observacion) => `
            <tr data-id="${observacion.id}">
              <td>${formatFecha(observacion.fecha)}</td><td>${escapeHtml(observacion.estacion.nombre)}</td>
              <td class="num">${valor(observacion.lluvia_mm, ' mm')}</td><td class="num">${valor(observacion.temp_min_c, ' °C')}</td>
              <td class="num">${valor(observacion.temp_max_c, ' °C')}</td><td class="num">${valor(observacion.humedad_pct, '%')}</td>
              <td class="num">${valor(observacion.viento_ms, ' m/s')}</td>
              <td class="row-actions"><button class="icon-btn" data-accion="editar">Editar</button><button class="icon-btn danger" data-accion="eliminar">Eliminar</button></td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;
    contenedor.querySelectorAll('[data-accion="editar"]').forEach((button) => {
      button.addEventListener('click', () => {
        const observacion = observaciones.find((item) => item.id === button.closest('tr').dataset.id);
        formularioObservacion(observacion, pintar);
      });
    });
    contenedor.querySelectorAll('[data-accion="eliminar"]').forEach((button) => {
      button.addEventListener('click', () => {
        const observacion = observaciones.find((item) => item.id === button.closest('tr').dataset.id);
        if (!confirm(`¿Eliminar las observaciones del ${observacion.fecha}?`)) return;
        try {
          store.eliminarObservacionClima(observacion.id);
          pintar();
          mostrarToast('Observación eliminada');
        } catch (error) {
          mostrarToast(error.message);
        }
      });
    });
  }
  pintar();
}

function indicador(etiqueta, dato) {
  return `<div class="kpi-card"><p class="kpi-label">${etiqueta}</p><p class="kpi-value tabular">${dato}</p></div>`;
}

function valor(dato, unidad) {
  return dato === null || dato === undefined ? '—' : `${dato}${unidad}`;
}

function renderGraficaClima(mount, observaciones, proveedor) {
  const serie = observaciones.filter((observacion) =>
    observacion.lluvia_mm !== null || observacion.temp_min_c !== null || observacion.temp_max_c !== null,
  ).slice(0, 30).reverse();
  if (!serie.length) {
    mount.innerHTML = '';
    return;
  }
  const ancho = Math.max(520, serie.length * 38 + 88);
  const alto = 190;
  const lluvias = serie.filter((observacion) => observacion.lluvia_mm !== null).map((observacion) => observacion.lluvia_mm);
  const maxLluvia = Math.max(...lluvias, 1);
  const temperaturas = serie.flatMap((observacion) => [observacion.temp_min_c, observacion.temp_max_c]).filter(Number.isFinite);
  const tempMin = Math.min(...temperaturas, 0);
  const tempMax = Math.max(...temperaturas, 1);
  const posiciones = (campo) => serie.map((observacion, indice) => {
    const valor = observacion[campo];
    if (!Number.isFinite(valor)) return null;
    return {
      x: 52 + indice * ((ancho - 78) / Math.max(serie.length - 1, 1)),
      y: 24 + (1 - ((valor - tempMin) / Math.max(tempMax - tempMin, 1))) * 112,
      valor,
    };
  });
  const puntosMin = posiciones('temp_min_c');
  const puntosMax = posiciones('temp_max_c');
  const trazo = (puntos) => puntos.map((punto, indice) => {
    if (!punto) return '';
    return `${indice === 0 || !puntos[indice - 1] ? 'M' : 'L'} ${punto.x} ${punto.y}`;
  }).join(' ');
  const pasoEtiqueta = Math.max(1, Math.ceil(serie.length / 12));
  mount.innerHTML = `
    <div class="grid-2 climate-charts">
      <div class="chart-card">
        <h3>Precipitación · mm/día</h3>
        ${lluvias.length ? `<div class="chart-scroll"><svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Precipitación diaria de ${escapeHtml(proveedor)}">
          <title>Precipitación diaria · ${escapeHtml(proveedor)}</title>
          <line x1="44" y1="18" x2="44" y2="${alto - 30}" stroke="var(--line-strong)" />
          <line x1="44" y1="${alto - 30}" x2="${ancho - 12}" y2="${alto - 30}" stroke="var(--line-strong)" />
          ${puntosMin.map((punto, indice) => {
            if (!punto) return '';
            return `<circle cx="${punto.x}" cy="${punto.y}" r="2.5" fill="var(--chart-cold)" />`;
          }).join('')}
          ${puntosMax.map((punto) => {
            if (!punto) return '';
            return `<circle cx="${punto.x}" cy="${punto.y}" r="2.5" fill="var(--chart-warm)" />`;
          }).join('')}
          ${serie.map((observacion, indice) => {
            if (!Number.isFinite(observacion.lluvia_mm)) return '';
            const x = 52 + indice * ((ancho - 78) / Math.max(serie.length - 1, 1));
            const altura = (observacion.lluvia_mm / maxLluvia) * (alto - 66);
            return `<rect x="${x - 7}" y="${alto - 30 - altura}" width="14" height="${altura}" rx="4" fill="var(--chart-rain)" /><text x="${x}" y="${alto - 9}" text-anchor="middle" fill="var(--ink-soft)" font-size="9">${indice % pasoEtiqueta === 0 ? escapeHtml(observacion.fecha.slice(5)) : ''}</text>`;
          }).join('')}
          <text x="40" y="18" text-anchor="end" fill="var(--ink-soft)" font-size="10">${Math.round(maxLluvia)}</text>
        </svg></div><p class="chart-legend"><span><i style="background:var(--chart-rain)"></i>Precipitación diaria</span></p>` : '<p class="content-subtitle">No hay valores de precipitación.</p>'}
      </div>
      <div class="chart-card">
        <h3>Temperatura · °C</h3>
        ${temperaturas.length ? `<div class="chart-scroll"><svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Temperatura mínima y máxima de ${escapeHtml(proveedor)}">
          <title>Temperaturas diarias · ${escapeHtml(proveedor)}</title>
          <line x1="44" y1="18" x2="44" y2="${alto - 30}" stroke="var(--line-strong)" />
          <line x1="44" y1="${alto - 30}" x2="${ancho - 12}" y2="${alto - 30}" stroke="var(--line-strong)" />
          <path d="${trazo(puntosMin)}" fill="none" stroke="var(--chart-cold)" stroke-width="2.5" />
          <path d="${trazo(puntosMax)}" fill="none" stroke="var(--chart-warm)" stroke-width="2.5" />
          ${serie.map((observacion, indice) => {
            const x = 52 + indice * ((ancho - 78) / Math.max(serie.length - 1, 1));
            return `${indice % pasoEtiqueta === 0 ? `<text x="${x}" y="${alto - 9}" text-anchor="middle" fill="var(--ink-soft)" font-size="9">${escapeHtml(observacion.fecha.slice(5))}</text>` : ''}`;
          }).join('')}
          <text x="40" y="18" text-anchor="end" fill="var(--ink-soft)" font-size="10">${tempMax.toFixed(0)}°</text>
        </svg></div><p class="chart-legend"><span><i style="background:var(--chart-cold)"></i>Temperatura mínima</span><span><i style="background:var(--chart-warm)"></i>Temperatura máxima</span></p>` : '<p class="content-subtitle">No hay valores de temperatura.</p>'}
      </div>
    </div>
    <p class="content-subtitle">Hasta ${serie.length} fechas recientes con datos · ${escapeHtml(proveedor)}. Los días faltantes permanecen vacíos; no se interpretan como cero.</p>
  `;
}

function formularioEstacion(finca, editar, alGuardar) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Fuente / red meteorológica
      <input name="proveedor" required value="${editar ? escapeHtml(editar.proveedor) : 'IDEAM'}" placeholder="IDEAM, Comité de Cafeteros…" />
    </label>
    <label>Código en la fuente
      <input name="codigo" required value="${editar ? escapeHtml(editar.codigo) : ''}" placeholder="Código oficial de estación" />
    </label>
    <label>Nombre oficial
      <input name="nombre" required value="${editar ? escapeHtml(editar.nombre) : ''}" />
    </label>
    <div class="form-row">
      <label>Latitud
        <input name="lat" type="number" min="-90" max="90" step="0.000001" required value="${editar?.lat ?? ''}" />
      </label>
      <label>Longitud
        <input name="lng" type="number" min="-180" max="180" step="0.000001" required value="${editar?.lng ?? ''}" />
      </label>
    </div>
    <label>Altitud (m s. n. m.)
      <input name="altitud_m" type="number" min="0" step="1" value="${editar?.altitud_m ?? ''}" />
    </label>
    <p class="content-subtitle">Confirma coordenadas, altitud y nombre en el catálogo original de la red. La distancia no determina por sí sola la representatividad.</p>
    <div class="form-actions"><button class="btn btn-primary" type="submit">${editar ? 'Guardar cambios' : 'Guardar estación'}</button></div>
  `;
  const cerrar = abrirModal(editar ? 'Editar estación IDEAM' : 'Agregar estación IDEAM', form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const datos = {
      finca_id: finca.id, codigo: fd.get('codigo'), nombre: fd.get('nombre'), proveedor: fd.get('proveedor'),
      lat: fd.get('lat'), lng: fd.get('lng'), altitud_m: fd.get('altitud_m'),
    };
    try {
      if (editar) store.actualizarEstacionClima(editar.id, datos);
      else store.crearEstacionClima(datos);
      cerrar();
      alGuardar();
      mostrarToast(editar ? 'Estación actualizada' : 'Estación agregada');
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}

function formularioObservacion(observacion, alGuardar) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Fecha <input name="fecha" type="date" required value="${observacion.fecha}" /></label>
    <div class="form-row">
      <label>Precipitación (mm) <input name="lluvia_mm" type="number" min="0" step="0.1" value="${observacion.lluvia_mm ?? ''}" /></label>
      <label>Humedad relativa (%) <input name="humedad_pct" type="number" min="0" max="100" step="0.1" value="${observacion.humedad_pct ?? ''}" /></label>
    </div>
    <div class="form-row">
      <label>Temperatura mínima (°C) <input name="temp_min_c" type="number" step="0.1" value="${observacion.temp_min_c ?? ''}" /></label>
      <label>Temperatura máxima (°C) <input name="temp_max_c" type="number" step="0.1" value="${observacion.temp_max_c ?? ''}" /></label>
    </div>
    <label>Viento (m/s) <input name="viento_ms" type="number" min="0" step="0.1" value="${observacion.viento_ms ?? ''}" /></label>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Guardar cambios</button></div>
  `;
  const cerrar = abrirModal('Editar observación climática', form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    try {
      store.actualizarObservacionClima(observacion.id, Object.fromEntries(fd.entries()));
      cerrar();
      alGuardar();
      mostrarToast('Observación actualizada');
    } catch (error) {
      mostrarToast(error.message);
    }
  });
}

function parsearCSV(texto) {
  const filas = [];
  let fila = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (caracter === '"' && entreComillas && texto[i + 1] === '"') {
      celda += '"';
      i += 1;
    } else if (caracter === '"') {
      entreComillas = !entreComillas;
    } else if (caracter === ',' && !entreComillas) {
      fila.push(celda.trim());
      celda = '';
    } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
      if (caracter === '\r' && texto[i + 1] === '\n') i += 1;
      fila.push(celda.trim());
      if (fila.some(Boolean)) filas.push(fila);
      fila = [];
      celda = '';
    } else {
      celda += caracter;
    }
  }
  if (entreComillas) throw new Error('El CSV tiene comillas sin cerrar.');
  fila.push(celda.trim());
  if (fila.some(Boolean)) filas.push(fila);
  if (filas.length < 2) throw new Error('El CSV debe tener encabezados y al menos una observación.');

  const indices = new Map(filas[0].map((encabezado, indice) => [encabezado.toLowerCase(), indice]));
  if (!indices.has('fecha')) throw new Error('Falta la columna fecha.');
  const campos = ['lluvia_mm', 'temp_min_c', 'temp_max_c', 'humedad_pct', 'viento_ms'];
  if (!campos.some((campo) => indices.has(campo))) throw new Error(`Incluye al menos una columna de variables: ${campos.join(', ')}.`);
  return filas.slice(1).map((valores) => {
    const registro = { fecha: valores[indices.get('fecha')] };
    for (const campo of campos) registro[campo] = indices.has(campo) ? valores[indices.get(campo)] || null : null;
    return registro;
  });
}

function descargarPlantilla() {
  const blob = new Blob([PLANTILLA], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'plantilla-observaciones-IDEAM.csv';
  enlace.click();
  URL.revokeObjectURL(url);
}
