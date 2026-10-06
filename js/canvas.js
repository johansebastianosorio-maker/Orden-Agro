// =============================================================
// canvas.js — editor del diagrama de lotes sobre SVG.
//
// El viewBox ya no es una grilla de píxeles arbitraria: son
// metros reales, ajustados automáticamente al conjunto de puntos
// de la finca (ver geo.js). Un punto agregado con clic y un punto
// capturado por GPS conviven en el mismo sistema de coordenadas,
// así que el diagrama completo queda a escala real y las
// posiciones relativas entre lotes son honestas.
// =============================================================

import { cajaDelimitadora } from './geo.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function crearEditorLotes(svgEl, { onSeleccionar, onPuntosCambiaron }) {
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  let dibujando = false;
  let puntos = []; // {x, y, lat, lng|null} en metros locales
  let lotesActuales = [];
  let seleccionadoId = null;

  function puntoDesdeEvento(evt) {
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: vb.x + (clientX - rect.left) * scaleX,
      y: vb.y + (clientY - rect.top) * scaleY,
      lat: null, lng: null,
    };
  }

  function centroide(pts) {
    const n = pts.length;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function todosLosPuntos() {
    const pts = lotesActuales.flatMap((l) => l.poligono || []);
    if (dibujando) pts.push(...puntos);
    return pts;
  }

  function ajustarViewBox() {
    const caja = cajaDelimitadora(todosLosPuntos());
    svgEl.setAttribute('viewBox', `${caja.minX} ${caja.minY} ${caja.width} ${caja.height}`);
    const escala = Math.max(caja.width, caja.height) / 700;
    svgEl.dataset.escalaTrazo = escala.toFixed(3);
  }

  function pintar() {
    ajustarViewBox();
    svgEl.innerHTML = '';
    const e = parseFloat(svgEl.dataset.escalaTrazo) || 1;

    for (const lote of lotesActuales) {
      if (!lote.poligono || lote.poligono.length < 3) continue;
      const puntosAttr = lote.poligono.map((p) => `${p.x},${p.y}`).join(' ');
      const seleccionado = lote.id === seleccionadoId;
      const poly = el('polygon', {
        points: puntosAttr,
        class: `lote-polygon${seleccionado ? ' selected' : ''}`,
        fill: lote.color || '#35573C',
        stroke: lote.color || '#35573C',
        style: `stroke-width:${2 * e}px`,
      });
      poly.addEventListener('click', (ev) => { ev.stopPropagation(); onSeleccionar(lote.id); });
      svgEl.appendChild(poly);

      const c = centroide(lote.poligono);
      const label = el('text', { x: c.x, y: c.y, class: 'lote-label', 'text-anchor': 'middle', style: `font-size:${13 * e}px` });
      label.textContent = lote.nombre;
      svgEl.appendChild(label);
    }

    if (dibujando && puntos.length > 0) {
      if (puntos.length > 1) {
        svgEl.appendChild(el('polyline', {
          points: puntos.map((p) => `${p.x},${p.y}`).join(' '),
          class: 'draft-line', style: `stroke-width:${1.5 * e}px`,
        }));
      }
      puntos.forEach((p) => {
        svgEl.appendChild(el('circle', {
          cx: p.x, cy: p.y, r: 5 * e, class: `draft-point${p.lat !== null ? ' draft-point-gps' : ''}`,
        }));
      });
    }
  }

  svgEl.addEventListener('pointerdown', (evt) => {
    if (!dibujando) return;
    puntos.push(puntoDesdeEvento(evt));
    onPuntosCambiaron(puntos.length);
    pintar();
  });

  return {
    render(lotes, seleccionadoIdActual) {
      lotesActuales = lotes;
      seleccionadoId = seleccionadoIdActual;
      pintar();
    },
    iniciarDibujo() {
      dibujando = true;
      puntos = [];
      onPuntosCambiaron(0);
      pintar();
    },
    agregarPuntoGPS(punto) {
      if (!dibujando) return;
      puntos.push(punto);
      onPuntosCambiaron(puntos.length);
      pintar();
    },
    deshacerPunto() {
      puntos.pop();
      onPuntosCambiaron(puntos.length);
      pintar();
    },
    cancelarDibujo() {
      dibujando = false;
      puntos = [];
      pintar();
    },
    finalizarDibujo() {
      if (puntos.length < 3) return null;
      const resultado = [...puntos];
      dibujando = false;
      puntos = [];
      pintar();
      return resultado;
    },
    estaDibujando() {
      return dibujando;
    },
  };
}
