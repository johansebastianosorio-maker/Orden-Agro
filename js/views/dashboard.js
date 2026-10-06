import * as store from '../store.js';
import { formatCOP, formatFecha, escapeHtml } from '../format.js';

const TABLEROS = [
  ['inicio', 'Resumen'],
  ['produccion', 'Producción'],
  ['sanidad', 'Sanidad'],
  ['clima', 'Clima'],
  ['gestion', 'Operación y finanzas'],
];

export function render(mount, finca) {
  const { porLote, totales } = store.calcularCentroCostos(finca.id);
  const lotes = store.listarLotes(finca.id);
  const labores = store.listarLabores(finca.id);
  const pendientes = labores.filter((labor) => labor.estado !== 'completada');
  const inventarioBajo = store.alertasStockBajo(finca.id);
  const areaTotal = lotes.reduce((total, lote) => total + (Number(lote.area_ha) || 0), 0);
  const arboles = lotes.reduce((total, lote) => total + (store.arbolesEstimadosLote(lote) || 0), 0);
  const laboresVencidas = pendientes.filter((labor) => labor.fecha < new Date().toISOString().slice(0, 10));
  const proyeccionFinca = store.proyectarProduccionFinca(finca.id);
  const registrosSanidad = store.listarRegistrosFitosanitarios(finca.id);
  const gruposSanidad = [...new Map(registrosSanidad.map((registro) => [
    `${registro.lote_id}|${registro.agente.toLocaleLowerCase()}`, registro,
  ])).values()].map((registro) => ({
    registro,
    seguimiento: store.analizarSeguimientoFitosanitario(finca.id, registro.lote_id, registro.agente),
  }));
  const alertasSanidad = gruposSanidad.filter(({ seguimiento }) => seguimiento.alerta);
  const producciones = proyeccionFinca.porUnidad;

  mount.innerHTML = `
    <section class="dashboard-welcome panel">
      <div>
        <span class="eyebrow">CENTRO DE CONTROL</span>
        <h2>Hola, ${escapeHtml(finca.nombre)}</h2>
        <p class="content-subtitle">Elige un tablero para ver lo importante de cada área y abrir sus herramientas.</p>
      </div>
      <div class="dashboard-actions">
        <a class="btn btn-primary btn-small" href="#sanidad">Registrar monitoreo</a>
        <a class="btn btn-ghost btn-small" href="#produccion">Registrar cosecha</a>
        <a class="btn btn-ghost btn-small" href="#labores">Programar labor</a>
      </div>
    </section>
    <nav class="dashboard-tabs" role="tablist" aria-label="Tableros de la finca">
      ${TABLEROS.map(([id, nombre], indice) => `<button class="dashboard-tab ${indice === 0 ? 'active' : ''}" type="button" role="tab" id="tablero-tab-${id}" aria-controls="tablero-${id}" aria-selected="${indice === 0}" tabindex="${indice === 0 ? '0' : '-1'}" data-dashboard-tab="${id}">${nombre}</button>`).join('')}
    </nav>
    <div class="dashboard-panels">
      <section class="dashboard-panel" id="tablero-inicio" role="tabpanel" aria-labelledby="tablero-tab-inicio">
        <div class="kpi-row">
          ${kpi('Lotes', lotes.length, 'en administración')}
          ${kpi('Área registrada', `${areaTotal.toLocaleString('es-CO', { maximumFractionDigits: 2 })} ha`, 'área de lotes')}
          ${kpi('Árboles', arboles ? arboles.toLocaleString('es-CO') : '—', 'informados o estimados')}
          ${kpi('Pendientes', pendientes.length, 'labores sin completar')}
        </div>
        <div class="grid-2">
          <section class="panel"><div class="panel-header"><h3>Alertas y pendientes</h3></div>${alertasHTML({ lotes, laboresVencidas, inventarioBajo, gruposSanidad })}</section>
          <section class="panel"><div class="panel-header"><h3>Atajos de la finca</h3></div>
            <div class="dashboard-shortcuts">
              ${atajo('#lotes', 'Administrar lotes', 'Ficha productiva y mapa')}
              ${atajo('#produccion', 'Ver cosechas', 'Historial y referencias')}
              ${atajo('#sanidad', 'Seguimiento sanitario', `${alertasSanidad.length} seguimiento(s) por revisar`)}
              ${atajo('#clima', 'Consultar clima', 'Fuentes y observaciones')}
              ${atajo('#finanzas', 'Revisar finanzas', 'Ingresos, costos y gastos')}
              ${atajo('#inventario', 'Abrir bodega', `${inventarioBajo.length} alerta(s) de existencias`)}
            </div>
          </section>
        </div>
      </section>
      <section class="dashboard-panel" id="tablero-produccion" role="tabpanel" aria-labelledby="tablero-tab-produccion" hidden>
        <div class="kpi-row">
          ${kpi('Presentaciones con referencia', producciones.length, 'estimaciones separadas, no sumables')}
          ${kpi('Lotes con cultivo', lotes.filter((lote) => lote.cultivo).length, `de ${lotes.length} lotes`)}
          ${kpi('Cosechas registradas', store.listarCosechas(finca.id).length, 'registros reales')}
          <div class="kpi-card dashboard-kpi-action"><p class="kpi-label">Ir a Producción</p><a class="btn btn-primary btn-small" href="#produccion">Abrir módulo</a></div>
        </div>
        <div class="grid-2">
          <section class="panel"><div class="panel-header"><h3>Referencia por presentación</h3><a class="icon-btn" href="#produccion">Ver detalle</a></div>${graficaProduccion(producciones)}</section>
          <section class="panel"><div class="panel-header"><h3>Detalle por lote</h3><a class="icon-btn" href="#lotes">Editar ficha</a></div>
            ${lotes.length ? `<div class="dashboard-lot-list">${lotes.map((lote) => {
              const referencia = store.proyectarCosechaLote(finca.id, lote.id);
              const arbolesLote = store.arbolesEstimadosLote(lote);
              return `<article><div><strong>${escapeHtml(lote.nombre)}</strong><p class="content-subtitle">${escapeHtml(lote.cultivo || 'Cultivo sin registrar')}${lote.variedad ? ` · ${escapeHtml(lote.variedad)}` : ''}</p></div><div class="dashboard-lot-metric"><strong>${referencia.proyeccion ? `${referencia.proyeccion.produccion_central_kg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg` : 'Sin referencia'}</strong><span>${Number(lote.area_ha || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })} ha · ${arbolesLote === null ? 'árboles sin estimar' : arbolesLote.toLocaleString('es-CO')}</span></div></article>`;
            }).join('')}</div>` : '<div class="empty-state">Crea un lote para comenzar.</div>'}
          </section>
        </div>
        <p class="dashboard-disclaimer">Las referencias no son pronósticos calibrados; registra cosechas reales y compara campañas. Las presentaciones se muestran separadamente.</p>
      </section>
      <section class="dashboard-panel" id="tablero-sanidad" role="tabpanel" aria-labelledby="tablero-tab-sanidad" hidden>
        <div class="kpi-row">
          ${kpi('Monitoreos registrados', registrosSanidad.length, 'observaciones de campo')}
          ${kpi('Organismo · lote', gruposSanidad.length, 'grupos en seguimiento')}
          ${kpi('Alertas de seguimiento', alertasSanidad.length, 'revisar en campo')}
          <div class="kpi-card dashboard-kpi-action"><p class="kpi-label">Acción de campo</p><a class="btn btn-primary btn-small" href="#sanidad">Abrir Sanidad</a></div>
        </div>
        <section class="panel"><div class="panel-header"><h3>Seguimientos que requieren atención</h3><a class="icon-btn" href="#sanidad">Ver monitoreos y gráficas</a></div>
          ${alertasSanidad.length ? `<div class="grid-2">${alertasSanidad.map(({ registro, seguimiento }) => {
            const lote = lotes.find((item) => item.id === registro.lote_id);
            return `<article class="health-alert-card"><h3>${escapeHtml(registro.agente)} · ${escapeHtml(lote?.nombre || 'Lote')}</h3><p>${escapeHtml(seguimiento.motivo_alerta || 'Revisar monitoreo reciente.')}</p><p class="content-subtitle">Última observación: ${formatFecha(registro.fecha)} · incidencia ${seguimiento.actual?.incidencia_pct ?? 'sin dato'}%</p><a class="btn btn-ghost btn-small" href="#sanidad">Abrir seguimiento</a></article>`;
          }).join('')}</div>` : '<div class="empty-state">No hay alertas activas basadas en los umbrales configurados. Mantén el monitoreo preventivo.</div>'}
        </section>
        <section class="panel"><div class="panel-header"><h3>Observaciones recientes</h3><a class="icon-btn" href="#sanidad">Registrar monitoreo</a></div>${tablaSanidad(registrosSanidad.slice(0, 6), lotes)}</section>
      </section>
      <section class="dashboard-panel" id="tablero-clima" role="tabpanel" aria-labelledby="tablero-tab-clima" hidden>
        <div class="kpi-row">
          ${kpi('Fuentes registradas', store.listarEstacionesClima(finca.id).length, 'estaciones o grillas')}
          ${kpi('Lotes georreferenciados', lotes.filter((lote) => (lote.poligono || []).some((punto) =>
            punto.lat !== null && punto.lat !== undefined && punto.lng !== null && punto.lng !== undefined &&
            Number.isFinite(Number(punto.lat)) && Number.isFinite(Number(punto.lng)),
          )).length, 'con puntos GPS en el mapa')}
          ${kpi('Interacción requerida', 'Consultar', 'las series no se actualizan solas')}
          <div class="kpi-card dashboard-kpi-action"><p class="kpi-label">Acción climática</p><a class="btn btn-primary btn-small" href="#clima">Abrir Clima</a></div>
        </div>
        <div class="grid-2">
          <section class="panel"><div class="panel-header"><h3>Fuente más cercana</h3><a class="icon-btn" href="#clima">Gestionar fuentes</a></div>${resumenClima(finca, lotes)}</section>
          <section class="panel"><div class="panel-header"><h3>Uso prudente de los datos</h3></div><p class="content-subtitle">Compara la fuente, distancia, cobertura y fechas antes de relacionar clima con cultivo. NASA POWER entrega datos modelados/reanálisis, no observaciones puntuales de tu lote ni pronósticos futuros.</p><a class="btn btn-ghost btn-small" href="#sanidad">Ver asociación exploratoria con Sanidad</a></section>
        </div>
      </section>
      <section class="dashboard-panel" id="tablero-gestion" role="tabpanel" aria-labelledby="tablero-tab-gestion" hidden>
        <div class="kpi-row">
          ${kpi('Ingresos', formatCOP(totales.ingresos), 'registrados')}
          ${kpi('Costos y gastos', formatCOP(totales.costos), 'registrados')}
          ${kpi('Margen registrado', formatCOP(totales.margen), 'no equivale a utilidad contable')}
          <div class="kpi-card dashboard-kpi-action"><p class="kpi-label">Acción financiera</p><a class="btn btn-primary btn-small" href="#finanzas">Abrir finanzas</a></div>
        </div>
        <div class="grid-2">
          <section class="panel"><div class="panel-header"><h3>Labores abiertas</h3><a class="icon-btn" href="#labores">Ver cronograma</a></div>
            ${pendientes.length ? `<div class="dashboard-lot-list">${pendientes.slice(0, 8).map((labor) => {
              const lote = lotes.find((item) => item.id === labor.lote_id);
              return `<article><div><strong>${escapeHtml(labor.nombre)}</strong><p class="content-subtitle">${escapeHtml(lote?.nombre || 'General')} · ${escapeHtml(labor.estado)}</p></div><div class="dashboard-lot-metric"><strong>${formatFecha(labor.fecha)}</strong><span>Previsto ${formatCOP(store.costoEstimadoLabor(labor.id))}</span></div></article>`;
            }).join('')}</div>` : '<div class="empty-state">No hay labores abiertas.</div>'}
          </section>
          <section class="panel"><div class="panel-header"><h3>Centro de costos por lote</h3><a class="icon-btn" href="#finanzas">Ver finanzas</a></div>
            ${porLote.length ? `<div class="dashboard-lot-list">${porLote.map((item) => `<article><div><strong>${escapeHtml(item.lote.nombre)}</strong><p class="content-subtitle">${formatCOP(item.ingresos)} ingresos</p></div><div class="dashboard-lot-metric"><strong>${formatCOP(item.margen)}</strong><span>${formatCOP(item.costos)} costos</span></div></article>`).join('')}</div>` : '<div class="empty-state">Registra lotes y movimientos para organizar el centro de costos.</div>'}
          </section>
        </div>
      </section>
    </div>
  `;
  mount.querySelectorAll('[data-dashboard-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const activo = button.dataset.dashboardTab;
      mount.querySelectorAll('[data-dashboard-tab]').forEach((tab) => {
        const seleccionado = tab === button;
        tab.classList.toggle('active', seleccionado);
        tab.setAttribute('aria-selected', String(seleccionado));
        tab.tabIndex = seleccionado ? 0 : -1;
      });
      mount.querySelectorAll('.dashboard-panel').forEach((panel) => {
        panel.hidden = panel.id !== `tablero-${activo}`;
      });
    });
  });
}

function kpi(titulo, valor, nota) {
  return `<div class="kpi-card"><p class="kpi-label">${escapeHtml(titulo)}</p><p class="kpi-value tabular">${escapeHtml(valor)}</p><p class="dashboard-kpi-note">${escapeHtml(nota)}</p></div>`;
}

function atajo(href, titulo, nota) {
  return `<a class="dashboard-shortcut" href="${href}"><strong>${escapeHtml(titulo)}</strong><span>${escapeHtml(nota)}</span><span aria-hidden="true">→</span></a>`;
}

function graficaProduccion(grupos) {
  if (!grupos.length) return '<div class="empty-state">Registra cosechas reales para construir referencias por presentación y lote.</div>';
  return `<div class="dashboard-production-cards">${grupos.map((grupo) => `<article><span>${escapeHtml(nombreUnidad(grupo.unidad_producto))}</span><strong>${grupo.produccion_central_kg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg</strong><small>${grupo.lotes.length} lote(s) · referencia descriptiva</small></article>`).join('')}</div><a class="btn btn-ghost btn-small" href="#produccion">Abrir gráficas e historial de campañas</a>`;
}

function tablaSanidad(registros, lotes) {
  if (!registros.length) return '<div class="empty-state">Aún no hay monitoreos fitosanitarios.</div>';
  return `<div class="dashboard-table-wrap"><table><thead><tr><th>Fecha</th><th>Organismo</th><th>Lote</th><th>Incidencia</th><th>Estado</th></tr></thead><tbody>${registros.map((registro) => `<tr><td>${formatFecha(registro.fecha)}</td><td>${escapeHtml(registro.agente)}</td><td>${escapeHtml(lotes.find((lote) => lote.id === registro.lote_id)?.nombre || 'Lote')}</td><td>${registro.incidencia_pct === null ? '—' : `${registro.incidencia_pct}%`}</td><td>${escapeHtml((registro.diagnostico || 'sin estado').replaceAll('_', ' '))}</td></tr>`).join('')}</tbody></table></div>`;
}

function alertasHTML({ lotes, laboresVencidas, inventarioBajo, gruposSanidad }) {
  const elementos = [];
  for (const lote of lotes) {
    if (!lote.cultivo) elementos.push(`Completa el cultivo de ${lote.nombre}.`);
    if (lote.cultivo && !lote.variedad) elementos.push(`Registra la variedad de ${lote.nombre}.`);
    if (lote.cultivo && (lote.edad_anios === null || lote.edad_anios === undefined || !lote.distancia_surcos_m || !lote.distancia_plantas_m)) {
      elementos.push(`Completa edad y distancias de siembra de ${lote.nombre}.`);
    }
  }
  laboresVencidas.forEach((labor) => elementos.push(`Labor vencida: ${labor.nombre} (${formatFecha(labor.fecha)}).`));
  inventarioBajo.forEach((insumo) => elementos.push(`Revisar existencias de ${insumo.nombre}.`));
  gruposSanidad.filter(({ seguimiento }) => seguimiento.alerta).forEach(({ registro }) =>
    elementos.push(`Revisar ${registro.agente} en ${lotes.find((lote) => lote.id === registro.lote_id)?.nombre || 'lote'}.`),
  );
  if (!lotes.length) elementos.push('Crea un lote para habilitar el resumen productivo.');
  return elementos.length
    ? `<ul class="dashboard-alert-list">${elementos.slice(0, 8).map((texto) => `<li>${escapeHtml(texto)}</li>`).join('')}</ul>`
    : '<p class="content-subtitle">No hay alertas operativas registradas. Esto no reemplaza la revisión periódica del cultivo.</p>';
}

function nombreUnidad(unidad) {
  return {
    kg_pergamino_seco: 'Café pergamino seco',
    kg_cereza: 'Café cereza',
    kg_otro: 'Otra presentación',
  }[unidad] || 'Producto';
}

function resumenClima(finca, lotes) {
  const lote = lotes[0] || null;
  const estacion = store.estacionMasCercanaConObservaciones(finca.id, lote?.id || null) ||
    store.estacionMasCercana(finca.id, lote?.id || null);
  if (!estacion) return '<p class="content-subtitle">Registra una fuente climática con ubicación en el módulo Clima.</p>';
  const observacion = store.listarObservacionesClima(estacion.id)[0];
  return observacion
    ? `<p><strong>${escapeHtml(estacion.nombre)}</strong> · ${estacion.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km del lote ${escapeHtml(lote?.nombre || 'de referencia')}.</p><p class="content-subtitle">Último registro: ${formatFecha(observacion.fecha)} · lluvia ${observacion.lluvia_mm === null ? 'sin dato' : `${observacion.lluvia_mm} mm`} · temperatura ${observacion.temp_min_c ?? '—'}–${observacion.temp_max_c ?? '—'} °C · humedad ${observacion.humedad_pct ?? '—'}%.</p><p class="content-subtitle">La distancia y el dato no garantizan representatividad local.</p>`
    : `<p><strong>${escapeHtml(estacion.nombre)}</strong> · fuente más cercana (${estacion.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km).</p><p class="content-subtitle">Aún no hay observaciones importadas o consultadas.</p>`;
}
