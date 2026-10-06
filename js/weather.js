const API_NASA_POWER = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const PARAMETROS = {
  PRECTOTCORR: 'lluvia_mm',
  T2M_MIN: 'temp_min_c',
  T2M_MAX: 'temp_max_c',
  RH2M: 'humedad_pct',
  WS2M: 'viento_ms',
};

export async function consultarClimaNASA({ lat, lng, desde, hasta, signal }) {
  const parametros = Object.keys(PARAMETROS).join(',');
  const url = new URL(API_NASA_POWER);
  url.search = new URLSearchParams({
    parameters: parametros,
    community: 'AG',
    longitude: String(lng),
    latitude: String(lat),
    start: desde.replaceAll('-', ''),
    end: hasta.replaceAll('-', ''),
    format: 'JSON',
    'time-standard': 'UTC',
  });

  let respuesta;
  try {
    respuesta = await fetch(url, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La consulta climática tardó demasiado. Intenta de nuevo.');
    throw new Error(`No se pudo conectar con NASA POWER: ${error.message}`);
  }
  if (!respuesta.ok) throw new Error(`NASA POWER respondió con error HTTP ${respuesta.status}.`);

  const resultado = await respuesta.json();
  if (resultado.messages?.length) {
    throw new Error(resultado.messages.join(' '));
  }
  const datos = resultado.properties?.parameter;
  if (!datos || !resultado.geometry?.coordinates) {
    throw new Error('NASA POWER devolvió una respuesta sin datos diarios para esas coordenadas y fechas.');
  }

  const fechas = Object.keys(datos.PRECTOTCORR || {}).sort();
  const filas = fechas.map((fecha) => {
    const fila = { fecha: `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}` };
    for (const [parametro, campo] of Object.entries(PARAMETROS)) {
      const valor = datos[parametro]?.[fecha];
      fila[campo] = valor === undefined || valor === null || valor <= -998 ? null : Number(valor);
    }
    if (fila.temp_min_c === null && fila.temp_max_c === null) {
      fila.temp_min_c = datos.T2M?.[fecha] > -998 ? Number(datos.T2M[fecha]) : null;
      fila.temp_max_c = fila.temp_min_c;
    }
    return fila;
  }).filter((fila) => Object.values(fila).some((valor) => valor !== null && valor !== undefined && valor !== fila.fecha));

  if (!filas.length) throw new Error('NASA POWER no tiene valores diarios disponibles para el periodo elegido.');
  const [longitud, latitud, altitud] = resultado.geometry.coordinates;
  return {
    filas,
    lat: Number(latitud),
    lng: Number(longitud),
    altitud_m: Number.isFinite(Number(altitud)) ? Number(altitud) : null,
    fuente: 'NASA POWER',
    resolucion: 'Grilla global nativa aproximada de 0,5° × 0,625°; reanálisis MERRA-2 y fuentes POWER.',
    periodo: { desde, hasta },
  };
}
