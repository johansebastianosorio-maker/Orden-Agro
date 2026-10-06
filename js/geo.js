// =============================================================
// geo.js — GPS gratuito (API de geolocalización del navegador),
// sin llaves ni servicios de pago.
//
// Los puntos de un lote se guardan en metros locales {x,y}
// relativos a un único origen GPS por finca (finca.origen_gps).
// x = metros al este(+)/oeste(-); y = metros al norte(+)/sur(-).
// Así, dibujar a mano (clic) y capturar por GPS conviven en el
// mismo sistema de coordenadas, y el diagrama completo de la
// finca queda a escala real — no es un boceto libre.
//
// Cuando el primer punto GPS de la finca se captura, ese punto
// se vuelve el origen (0,0): todo lo ya dibujado a mano queda
// automáticamente georreferenciado en retrospectiva, sin migrar
// datos.
// =============================================================

const RADIO_TIERRA_M = 6371000;

/** Convierte un punto GPS a metros locales relativos a un origen. */
export function gpsAMetrosLocales(lat, lng, origen) {
  const dLat = (lat - origen.lat) * (Math.PI / 180);
  const dLng = (lng - origen.lng) * (Math.PI / 180);
  const x = dLng * Math.cos(origen.lat * (Math.PI / 180)) * RADIO_TIERRA_M;
  const yNorte = dLat * RADIO_TIERRA_M;
  return { x, y: -yNorte }; // y negativo = "arriba" en pantalla (norte arriba)
}

/** Convierte metros locales de vuelta a coordenadas GPS absolutas (para exportar). */
export function metrosLocalesAGps(x, y, origen) {
  const yNorte = -y;
  const dLat = yNorte / RADIO_TIERRA_M;
  const dLng = x / (RADIO_TIERRA_M * Math.cos(origen.lat * (Math.PI / 180)));
  return {
    lat: origen.lat + dLat * (180 / Math.PI),
    lng: origen.lng + dLng * (180 / Math.PI),
  };
}

/** Pide la ubicación actual del dispositivo. Requiere permiso del navegador; es gratuita (sin llave ni servicio externo). */
export function obtenerUbicacionActual() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo/navegador no soporta geolocalización.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(traducirErrorGeo(err))),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

function traducirErrorGeo(err) {
  if (err.code === 1) return 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador o marca el punto manualmente sobre el diagrama.';
  if (err.code === 2) return 'No se pudo determinar tu ubicación (sin señal GPS). Intenta de nuevo o marca el punto manualmente.';
  if (err.code === 3) return 'La ubicación tardó demasiado en responder. Intenta de nuevo.';
  return 'No se pudo obtener tu ubicación.';
}

/** Área real de un polígono en metros locales (fórmula del shoelace) → hectáreas. */
export function areaHaDePoligono(puntos) {
  if (!puntos || puntos.length < 3) return 0;
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    suma += a.x * b.y - b.x * a.y;
  }
  const areaM2 = Math.abs(suma) / 2;
  return Math.round((areaM2 / 10000) * 100) / 100;
}

/** Caja delimitadora de un conjunto de puntos, con margen — para ajustar el viewBox del diagrama. */
export function cajaDelimitadora(todosPuntos, margenM = 15) {
  if (!todosPuntos || todosPuntos.length === 0) {
    return { minX: -50, minY: -50, width: 100, height: 100 };
  }
  const xs = todosPuntos.map((p) => p.x);
  const ys = todosPuntos.map((p) => p.y);
  const minX = Math.min(...xs) - margenM;
  const maxX = Math.max(...xs) + margenM;
  const minY = Math.min(...ys) - margenM;
  const maxY = Math.max(...ys) + margenM;
  const width = Math.max(maxX - minX, 20);
  const height = Math.max(maxY - minY, 20);
  return { minX, minY, width, height };
}
