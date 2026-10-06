// =============================================================
// store.js — capa de datos de la aplicación.
//
// Persiste en localStorage con un esquema relacional (IDs como
// llaves foráneas) equivalente 1:1 al de schema.sql. Cuando el
// proyecto pase a un backend real (Supabase/Postgres), esta es
// la única capa que debe reescribirse: las vistas no tocan
// localStorage directamente, solo llaman funciones de aquí.
// =============================================================

import { uid, hoyISO } from './format.js';

const DB_KEY = 'finca_app_db_v1';

const COLLECTIONS = [
  'usuarios', 'fincas', 'lotes',
  'insumos', 'herramientas', 'personal',
  'labores', 'mano_obra', 'consumos_labor', 'cosechas', 'movimientos_inventario',
  'movimientos_financieros', 'estaciones_clima', 'observaciones_clima',
  'registros_fitosanitarios',
];

function emptyDB() {
  const db = {};
  for (const c of COLLECTIONS) db[c] = [];
  return db;
}

let db = null;
const listeners = new Set();
let transactionDepth = 0;
let transactionPending = false;

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase();
}

function sanitizeText(value) {
  return (value || '').trim();
}

function validarTexto(value, label) {
  const texto = sanitizeText(value);
  if (texto.length < 2) throw new Error(`${label} debe tener al menos 2 caracteres.`);
  return texto;
}

function validarNumero(value, label, { min = 0, entero = false } = {}) {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero < min || (entero && !Number.isInteger(numero))) {
    throw new Error(`${label} debe ser ${entero ? 'un número entero' : 'un número válido'} mayor o igual a ${min}.`);
  }
  return numero;
}

function validarFecha(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) {
    throw new Error('La fecha debe ser válida.');
  }
  const [year, month, day] = fecha.split('-').map(Number);
  const fechaUTC = new Date(Date.UTC(year, month - 1, day));
  if (fechaUTC.getUTCFullYear() !== year || fechaUTC.getUTCMonth() !== month - 1 || fechaUTC.getUTCDate() !== day) {
    throw new Error('La fecha debe ser válida.');
  }
  return fecha;
}

function validarOpcion(valor, opciones, label) {
  if (!opciones.includes(valor)) throw new Error(`${label} no es una opción válida.`);
  return valor;
}

function loteDeFinca(lote_id, finca_id) {
  if (!lote_id) return null;
  const lote = obtener('lotes', lote_id);
  if (!lote || lote.finca_id !== finca_id) throw new Error('El lote seleccionado no pertenece a esta finca.');
  return lote;
}

function enTransaccion(operacion) {
  if (transactionDepth > 0) return operacion();

  const snapshot = JSON.stringify(db);
  transactionDepth += 1;
  let resultado;
  try {
    resultado = operacion();
  } catch (error) {
    transactionDepth -= 1;
    db = JSON.parse(snapshot);
    transactionPending = false;
    throw error;
  }
  transactionDepth -= 1;
  if (transactionPending) {
    transactionPending = false;
    try {
      persist();
    } catch (error) {
      db = JSON.parse(snapshot);
      throw error;
    }
  }
  return resultado;
}

async function hashPassword(password) {
  const text = typeof password === 'string' ? password : String(password || '');
  const buffer = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validateCredenciales({ nombre, email, password, finca_nombre }) {
  if (nombre !== undefined && sanitizeText(nombre).length < 2) {
    throw new Error('El nombre debe tener al menos 2 caracteres.');
  }
  if (finca_nombre !== undefined && sanitizeText(finca_nombre).length < 2) {
    throw new Error('El nombre de la finca debe tener al menos 2 caracteres.');
  }
  const emailOk = normalizeEmail(email).match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  if (!emailOk) {
    throw new Error('Ingresa un correo electrónico válido.');
  }
  if (password !== undefined && String(password).length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }
}

function load() {
  try {
    db = JSON.parse(localStorage.getItem(DB_KEY));
  } catch (e) {
    db = null;
  }
  if (!db || typeof db !== 'object') db = emptyDB();
  for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];

  return db;
}

function persist() {
  if (transactionDepth > 0) {
    transactionPending = true;
    return;
  }
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    throw new Error(`No se pudieron guardar los datos del sistema: ${e.message}`);
  }
  listeners.forEach((fn) => fn());
}

load();

/** Suscribirse a cualquier cambio de datos (para re-renderizar vistas). */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// -------------------------------------------------------------
// CRUD genérico
// -------------------------------------------------------------
function listar(col, filtro = null) {
  const rows = db[col];
  return filtro ? rows.filter(filtro) : [...rows];
}
function obtener(col, id) {
  return db[col].find((r) => r.id === id) || null;
}
function crear(col, datos) {
  return enTransaccion(() => {
    const row = { id: uid(col.slice(0, -1)), created_at: new Date().toISOString(), ...datos };
    db[col].push(row);
    persist();
    return row;
  });
}
function actualizar(col, id, cambios) {
  return enTransaccion(() => {
    const row = obtener(col, id);
    if (!row) throw new Error('Registro no encontrado');
    Object.assign(row, cambios);
    persist();
    return row;
  });
}
function eliminar(col, id) {
  return enTransaccion(() => {
    db[col] = db[col].filter((r) => r.id !== id);
    persist();
  });
}

// -------------------------------------------------------------
// Usuario / Autenticación simulada (Preparado para Supabase)
// -------------------------------------------------------------
export function getFincaActiva() {
  const userId = localStorage.getItem('mock_session_id');
  if (!userId) return null;
  return db.fincas.find(f => f.usuario_id === userId) || null;
}

export function getUsuarioActivo() {
  const userId = localStorage.getItem('mock_session_id');
  return db.usuarios.find(u => u.id === userId) || null;
}

export function actualizarFinca(id, cambios) {
  const finca = obtener('fincas', id);
  if (!finca) throw new Error('Finca no encontrada.');
  const datos = { ...cambios };
  if (datos.nombre !== undefined) datos.nombre = validarTexto(datos.nombre, 'El nombre de la finca');
  if (datos.ubicacion !== undefined) datos.ubicacion = sanitizeText(datos.ubicacion);
  return actualizar('fincas', id, datos);
}

export function actualizarUsuario(id, cambios) {
  const usuario = obtener('usuarios', id);
  if (!usuario) throw new Error('Usuario no encontrado.');
  const datos = { ...cambios };
  if (datos.nombre !== undefined) datos.nombre = validarTexto(datos.nombre, 'El nombre');
  return actualizar('usuarios', id, datos);
}

export function actualizarPerfilFinca(finca_id, usuario_id, { finca_nombre, usuario_nombre, ubicacion }) {
  const finca = obtener('fincas', finca_id);
  const usuario = obtener('usuarios', usuario_id);
  if (!finca || finca.usuario_id !== usuario_id || !usuario) throw new Error('El perfil seleccionado no corresponde a la sesión activa.');
  const nombreFinca = validarTexto(finca_nombre, 'El nombre de la finca');
  const nombreUsuario = validarTexto(usuario_nombre, 'El nombre');
  return enTransaccion(() => {
    actualizar('fincas', finca_id, { nombre: nombreFinca, ubicacion: sanitizeText(ubicacion) });
    return actualizar('usuarios', usuario_id, { nombre: nombreUsuario });
  });
}

export async function login(email, password) {
  const emailNorm = normalizeEmail(email);
  const passwordNorm = String(password || '');
  validateCredenciales({ email: emailNorm, password: passwordNorm });

  await new Promise(r => setTimeout(r, 600));

  const passwordHash = await hashPassword(passwordNorm);
  const user = db.usuarios.find((u) => normalizeEmail(u.email) === emailNorm && (
    u.password === passwordNorm ||
    u.password_hash === passwordHash
  ));
  if (!user) throw new Error('Credenciales incorrectas');

  if (user.password && !user.password_hash) {
    await actualizar('usuarios', user.id, { password_hash: passwordHash, password: undefined });
  }

  localStorage.setItem('mock_session_id', user.id);
  return { ...user, password_hash: user.password_hash || passwordHash };
}

export async function registro({ nombre, email, password, finca_nombre }) {
  const nombreNorm = sanitizeText(nombre);
  const fincaNorm = sanitizeText(finca_nombre);
  const emailNorm = normalizeEmail(email);
  validateCredenciales({ nombre: nombreNorm, email: emailNorm, password, finca_nombre: fincaNorm });

  await new Promise(r => setTimeout(r, 600));

  if (db.usuarios.some((u) => normalizeEmail(u.email) === emailNorm)) {
    throw new Error('El correo ya está registrado');
  }

  const password_hash = await hashPassword(password);
  const { usuario, finca } = enTransaccion(() => {
    const nuevoUsuario = crear('usuarios', { nombre: nombreNorm, email: emailNorm, password_hash });
    const nuevaFinca = crear('fincas', { usuario_id: nuevoUsuario.id, nombre: fincaNorm, ubicacion: '' });
    return { usuario: nuevoUsuario, finca: nuevaFinca };
  });

  localStorage.setItem('mock_session_id', usuario.id);
  return { usuario, finca };
}

export function logout() {
  localStorage.removeItem('mock_session_id');
}

export function borrarTodo() {
  db = emptyDB();
  persist();
  logout();
}
export function exportarJSON() {
  return JSON.stringify(db, null, 2);
}

/** Establece el origen GPS de la finca solo si todavía no tiene uno (primer punto GPS capturado). */
export function establecerOrigenGpsSiFalta(finca_id, { lat, lng }) {
  const finca = obtener('fincas', finca_id);
  if (finca && !finca.origen_gps) {
    const latitud = validarNumero(lat, 'La latitud', { min: -90 });
    const longitud = validarNumero(lng, 'La longitud', { min: -180 });
    if (latitud > 90 || longitud > 180) throw new Error('Las coordenadas GPS están fuera de rango.');
    actualizar('fincas', finca_id, { origen_gps: { lat: latitud, lng: longitud } });
  }
  return finca?.origen_gps || null;
}

// -------------------------------------------------------------
// Lotes
// -------------------------------------------------------------
export function listarLotes(finca_id) {
  return listar('lotes', (l) => l.finca_id === finca_id);
}
export function crearLote({
  finca_id, nombre, cultivo, area_ha, color, poligono,
  variedad = '', edad_anios = null, distancia_surcos_m = null,
  distancia_plantas_m = null, arboles_actuales = null, area_productiva_ha = null,
  arboles_productivos = null, altitud_m = null, tipo_suelo = '',
  riego = 'desconocido', sombra = 'desconocido',
}) {
  const nombreValidado = validarTexto(nombre, 'El nombre del lote');
  const area = validarNumero(area_ha, 'El área', { min: 0 });
  const areaProductiva = area_productiva_ha === '' || area_productiva_ha === null
    ? null
    : validarNumero(area_productiva_ha, 'El área productiva', { min: Number.MIN_VALUE });
  if (!obtener('fincas', finca_id)) throw new Error('La finca seleccionada no existe.');
  if (area <= 0) throw new Error('El área del lote debe ser mayor a cero.');
  if (areaProductiva !== null && areaProductiva > area) throw new Error('El área productiva no puede superar el área total del lote.');
  return crear('lotes', {
    finca_id, nombre: nombreValidado, cultivo: sanitizeText(cultivo), area_ha: area,
    color, poligono, variedad: sanitizeText(variedad),
    edad_anios: edad_anios === '' || edad_anios === null ? null : validarNumero(edad_anios, 'La edad del cultivo'),
    distancia_surcos_m: distancia_surcos_m === '' || distancia_surcos_m === null ? null : validarNumero(distancia_surcos_m, 'La distancia entre surcos', { min: Number.MIN_VALUE }),
    distancia_plantas_m: distancia_plantas_m === '' || distancia_plantas_m === null ? null : validarNumero(distancia_plantas_m, 'La distancia entre plantas', { min: Number.MIN_VALUE }),
    arboles_actuales: arboles_actuales === '' || arboles_actuales === null ? null : validarNumero(arboles_actuales, 'El número de árboles', { entero: true }),
    area_productiva_ha: areaProductiva,
    arboles_productivos: arboles_productivos === '' || arboles_productivos === null ? null : validarNumero(arboles_productivos, 'Los árboles productivos', { entero: true }),
    altitud_m: altitud_m === '' || altitud_m === null ? null : validarNumero(altitud_m, 'La altitud', { min: 0 }),
    tipo_suelo: sanitizeText(tipo_suelo),
    riego: validarOpcion(riego, ['si', 'no', 'desconocido'], 'El dato de riego'),
    sombra: validarOpcion(sombra, ['pleno_sol', 'sombra', 'mixto', 'desconocido'], 'El sistema de sombra'),
  });
}
export function actualizarLote(id, cambios) {
  const lote = obtener('lotes', id);
  if (!lote) throw new Error('Lote no encontrado.');
  const datos = { ...cambios };
  if (datos.nombre !== undefined) datos.nombre = validarTexto(datos.nombre, 'El nombre del lote');
  if (datos.area_ha !== undefined) {
    datos.area_ha = validarNumero(datos.area_ha, 'El área');
    if (datos.area_ha <= 0) throw new Error('El área del lote debe ser mayor a cero.');
  }
  if (datos.variedad !== undefined) datos.variedad = sanitizeText(datos.variedad);
  if (datos.edad_anios !== undefined) datos.edad_anios = datos.edad_anios === '' || datos.edad_anios === null ? null : validarNumero(datos.edad_anios, 'La edad del cultivo');
  if (datos.distancia_surcos_m !== undefined) datos.distancia_surcos_m = datos.distancia_surcos_m === '' || datos.distancia_surcos_m === null ? null : validarNumero(datos.distancia_surcos_m, 'La distancia entre surcos', { min: Number.MIN_VALUE });
  if (datos.distancia_plantas_m !== undefined) datos.distancia_plantas_m = datos.distancia_plantas_m === '' || datos.distancia_plantas_m === null ? null : validarNumero(datos.distancia_plantas_m, 'La distancia entre plantas', { min: Number.MIN_VALUE });
  if (datos.arboles_actuales !== undefined) datos.arboles_actuales = datos.arboles_actuales === '' || datos.arboles_actuales === null ? null : validarNumero(datos.arboles_actuales, 'El número de árboles', { entero: true });
  if (datos.area_productiva_ha !== undefined) datos.area_productiva_ha = datos.area_productiva_ha === '' || datos.area_productiva_ha === null ? null : validarNumero(datos.area_productiva_ha, 'El área productiva', { min: Number.MIN_VALUE });
  const areaTotal = datos.area_ha ?? lote.area_ha;
  const areaProductiva = datos.area_productiva_ha === undefined ? lote.area_productiva_ha : datos.area_productiva_ha;
  if (areaProductiva !== null && areaProductiva !== undefined && areaProductiva > areaTotal) {
    throw new Error('El área productiva no puede superar el área total del lote.');
  }
  if (datos.arboles_productivos !== undefined) datos.arboles_productivos = datos.arboles_productivos === '' || datos.arboles_productivos === null ? null : validarNumero(datos.arboles_productivos, 'Los árboles productivos', { entero: true });
  if (datos.altitud_m !== undefined) datos.altitud_m = datos.altitud_m === '' || datos.altitud_m === null ? null : validarNumero(datos.altitud_m, 'La altitud', { min: 0 });
  if (datos.tipo_suelo !== undefined) datos.tipo_suelo = sanitizeText(datos.tipo_suelo);
  if (datos.riego !== undefined) datos.riego = validarOpcion(datos.riego, ['si', 'no', 'desconocido'], 'El dato de riego');
  if (datos.sombra !== undefined) datos.sombra = validarOpcion(datos.sombra, ['pleno_sol', 'sombra', 'mixto', 'desconocido'], 'El sistema de sombra');
  return actualizar('lotes', id, datos);
}
export function arbolesEstimadosLote(lote) {
  if (Number.isInteger(lote.arboles_actuales) && lote.arboles_actuales >= 0) return lote.arboles_actuales;
  const area = Number(lote.area_productiva_ha) || Number(lote.area_ha);
  if (lote.distancia_surcos_m > 0 && lote.distancia_plantas_m > 0 && area > 0) {
    return Math.round((area * 10000) / (lote.distancia_surcos_m * lote.distancia_plantas_m));
  }
  return null;
}
export function listarCosechas(finca_id, lote_id = null) {
  return listar('cosechas', (c) => c.finca_id === finca_id && (!lote_id || c.lote_id === lote_id))
    .sort((a, b) => Number(b.campania) - Number(a.campania));
}
export function crearCosecha({ finca_id, lote_id, campania, produccion_kg, unidad_producto, area_cosechada_ha, observaciones = '', variedad = '' }) {
  const lote = loteDeFinca(lote_id, finca_id);
  if (!lote) throw new Error('Selecciona un lote para registrar la cosecha.');
  if (!sanitizeText(lote.cultivo)) throw new Error('Completa el cultivo del lote antes de registrar su cosecha.');
  const anio = validarNumero(campania, 'El año de campaña', { min: 2000, entero: true });
  if (anio > new Date().getFullYear()) throw new Error('El año de campaña no puede estar en el futuro.');
  const produccion = validarNumero(produccion_kg, 'La producción cosechada', { min: Number.MIN_VALUE });
  const area = area_cosechada_ha === '' || area_cosechada_ha === null
    ? lote.area_ha
    : validarNumero(area_cosechada_ha, 'El área cosechada', { min: Number.MIN_VALUE });
  const unidades = ['kg_pergamino_seco', 'kg_cereza', 'kg_otro'];
  if (!unidades.includes(unidad_producto)) throw new Error('Selecciona una unidad de producción válida.');
  const variedadCosechada = sanitizeText(variedad || lote.variedad) || null;
  if (listar('cosechas', (c) => c.lote_id === lote_id && c.campania === anio && c.unidad_producto === unidad_producto && (c.cultivo || null) === (lote.cultivo || null) && (c.variedad || null) === variedadCosechada).length) {
    throw new Error('Ya existe una producción registrada para este lote, campaña y producto.');
  }
  return crear('cosechas', {
    finca_id, lote_id, campania: anio, produccion_kg: produccion,
    unidad_producto, area_cosechada_ha: area, observaciones: sanitizeText(observaciones),
    cultivo: lote.cultivo || null, variedad: variedadCosechada,
  });
}
export function actualizarCosecha(id, cambios) {
  const cosecha = obtener('cosechas', id);
  if (!cosecha) throw new Error('Registro de cosecha no encontrado.');
  const lote = loteDeFinca(cambios.lote_id ?? cosecha.lote_id, cosecha.finca_id);
  if (!lote) throw new Error('Selecciona un lote válido.');
  if (!sanitizeText(lote.cultivo)) throw new Error('Completa el cultivo del lote antes de editar su cosecha.');
  const datos = { ...cambios };
  if (datos.campania !== undefined) {
    datos.campania = validarNumero(datos.campania, 'El año de campaña', { min: 2000, entero: true });
    if (datos.campania > new Date().getFullYear()) throw new Error('El año de campaña no puede estar en el futuro.');
  }
  if (datos.produccion_kg !== undefined) datos.produccion_kg = validarNumero(datos.produccion_kg, 'La producción cosechada', { min: Number.MIN_VALUE });
  if (datos.unidad_producto !== undefined && !['kg_pergamino_seco', 'kg_cereza', 'kg_otro'].includes(datos.unidad_producto)) {
    throw new Error('Selecciona una unidad de producción válida.');
  }
  const anio = datos.campania ?? cosecha.campania;
  const unidad = datos.unidad_producto ?? cosecha.unidad_producto;
  const loteId = datos.lote_id ?? cosecha.lote_id;
  const variedad = datos.variedad === undefined ? (cosecha.variedad || null) : sanitizeText(datos.variedad) || null;
  const cultivo = lote.cultivo || null;
  if (listar('cosechas', (c) => c.id !== id && c.lote_id === loteId && c.campania === anio && c.unidad_producto === unidad && (c.cultivo || null) === cultivo && (c.variedad || null) === variedad).length) {
    throw new Error('Ya existe una producción registrada para este lote, campaña y producto.');
  }
  if (datos.variedad !== undefined) datos.variedad = variedad;
  if (datos.lote_id !== undefined) datos.cultivo = cultivo;
  if (datos.area_cosechada_ha !== undefined) {
    datos.area_cosechada_ha = datos.area_cosechada_ha === '' || datos.area_cosechada_ha === null
      ? lote.area_ha
      : validarNumero(datos.area_cosechada_ha, 'El área cosechada', { min: Number.MIN_VALUE });
  }
  if (datos.observaciones !== undefined) datos.observaciones = sanitizeText(datos.observaciones);
  return actualizar('cosechas', id, datos);
}
export function eliminarCosecha(id) {
  eliminar('cosechas', id);
}
export function proyectarCosechaLote(finca_id, lote_id, unidadProducto = null) {
  const lote = loteDeFinca(lote_id, finca_id);
  if (!lote) throw new Error('Selecciona un lote válido de esta finca.');
  const cosechas = listarCosechas(finca_id, lote_id);
  if (!cosechas.length) return { lote, cosechas: [], historial_cosechas: 0, proyeccion: null };

  const unidad = unidadProducto || cosechas[0].unidad_producto;
  const serie = cosechas
    .filter((cosecha) =>
      cosecha.unidad_producto === unidad &&
      (cosecha.cultivo || null) === (lote.cultivo || null) &&
      (cosecha.variedad || null) === (lote.variedad || null),
    )
    .map((cosecha) => ({
      campania: cosecha.campania,
      produccion_kg: cosecha.produccion_kg,
      area_cosechada_ha: cosecha.area_cosechada_ha,
      rendimiento_kg_ha: cosecha.produccion_kg / cosecha.area_cosechada_ha,
    }))
    .sort((a, b) => a.campania - b.campania);
  if (!serie.length) return { lote, cosechas: [], historial_cosechas: cosechas.length, proyeccion: null, unidad_producto: unidad };
  const recientes = serie.slice(-5);
  const rendimientos = recientes.map((registro) => registro.rendimiento_kg_ha);
  const ordenados = [...rendimientos].sort((a, b) => a - b);
  const mediana = ordenados.length % 2
    ? ordenados[Math.floor(ordenados.length / 2)]
    : (ordenados[ordenados.length / 2 - 1] + ordenados[ordenados.length / 2]) / 2;
  const minimo = Math.min(...rendimientos);
  const maximo = Math.max(...rendimientos);
  const estimadoTendencia = recientes.length >= 3
    ? predecirRendimientoAcotado(recientes, Math.max(...serie.map((registro) => registro.campania)) + 1)
    : mediana;
  const centro = Math.min(maximo, Math.max(minimo, estimadoTendencia));
  const area = Number(lote.area_productiva_ha) || Number(lote.area_ha);
  const erroresValidacion = serie.length >= 4
    ? serie.slice(3).map((registro, indice) => {
      const anterior = serie.slice(0, indice + 3);
      const estimado = predecirRendimientoAcotado(anterior, registro.campania);
      return Math.abs(registro.rendimiento_kg_ha - estimado) / registro.rendimiento_kg_ha * 100;
    })
    : [];
  return {
    lote, cosechas: serie, unidad_producto: unidad, area_proyectada_ha: area,
    proyeccion: {
      campania: Math.max(...serie.map((registro) => registro.campania)) + 1,
      rendimiento_central_kg_ha: centro,
      produccion_central_kg: centro * area,
      rendimiento_observado_min_kg_ha: recientes.length > 1 ? minimo : null,
      rendimiento_observado_max_kg_ha: recientes.length > 1 ? maximo : null,
      produccion_observada_min_kg: recientes.length > 1 ? minimo * area : null,
      produccion_observada_max_kg: recientes.length > 1 ? maximo * area : null,
      numero_campanias: serie.length,
      metodo: recientes.length >= 3 ? 'tendencia_lineal_amortiguada_acotada' : 'mediana_historica',
      tendencia_acotada_por_historial: centro !== estimadoTendencia,
      campanias_modeladas: recientes.length,
      error_absoluto_porcentual_validacion_pct: erroresValidacion.length
        ? erroresValidacion.reduce((suma, error) => suma + error, 0) / erroresValidacion.length
        : null,
      arboles_productivos: lote.arboles_productivos || null,
      produccion_por_arbol_kg: lote.arboles_productivos > 0 ? (centro * area) / lote.arboles_productivos : null,
    },
  };
}

function estimarRendimientoTendencia(serie, campaniaObjetivo) {
  const recientes = serie.slice(-5);
  const anioReciente = recientes[recientes.length - 1].campania;
  const puntos = recientes.map((registro) => ({
    x: registro.campania - anioReciente,
    y: registro.rendimiento_kg_ha,
    peso: 0.6 ** (anioReciente - registro.campania),
  }));
  const pesoTotal = puntos.reduce((suma, punto) => suma + punto.peso, 0);
  const mediaX = puntos.reduce((suma, punto) => suma + punto.x * punto.peso, 0) / pesoTotal;
  const mediaY = puntos.reduce((suma, punto) => suma + punto.y * punto.peso, 0) / pesoTotal;
  const varianzaX = puntos.reduce((suma, punto) => suma + punto.peso * (punto.x - mediaX) ** 2, 0);
  const pendiente = varianzaX
    ? puntos.reduce((suma, punto) => suma + punto.peso * (punto.x - mediaX) * (punto.y - mediaY), 0) / varianzaX
    : 0;
  const pendienteAmortiguada = pendiente * 0.5;
  const distancia = Math.max(1, campaniaObjetivo - anioReciente);
  return Math.max(0, mediaY + pendienteAmortiguada * (distancia - mediaX));
}

function predecirRendimientoAcotado(serie, campaniaObjetivo) {
  const recientes = serie.slice(-5);
  const minimo = Math.min(...recientes.map((registro) => registro.rendimiento_kg_ha));
  const maximo = Math.max(...recientes.map((registro) => registro.rendimiento_kg_ha));
  return Math.min(maximo, Math.max(minimo, estimarRendimientoTendencia(recientes, campaniaObjetivo)));
}

export function proyectarProduccionFinca(finca_id) {
  const lotes = listarLotes(finca_id);
  const grupos = new Map();
  let lotesSinHistorial = 0;
  let lotesSinDatosComparables = 0;
  for (const lote of lotes) {
    const cosechas = listarCosechas(finca_id, lote.id);
    if (!cosechas.length) {
      lotesSinHistorial += 1;
      continue;
    }
    let tieneDatosComparables = false;
    const unidades = new Set(cosechas.map((cosecha) => cosecha.unidad_producto));
    for (const unidad of unidades) {
      const resultado = proyectarCosechaLote(finca_id, lote.id, unidad);
      if (!resultado.proyeccion) continue;
      tieneDatosComparables = true;
      const cultivo = resultado.lote.cultivo || 'Cultivo sin especificar';
      const variedad = resultado.lote.variedad || 'Variedad sin especificar';
      const key = `${cultivo.toLowerCase()}|${variedad.toLowerCase()}|${unidad}`;
      if (!grupos.has(key)) grupos.set(key, { cultivo, variedad, unidad_producto: unidad, produccion_central_kg: 0, lotes: [] });
      const grupo = grupos.get(key);
      grupo.produccion_central_kg += resultado.proyeccion.produccion_central_kg;
      grupo.lotes.push({ lote, proyeccion: resultado.proyeccion });
    }
    if (!tieneDatosComparables) lotesSinDatosComparables += 1;
  }
  return { porUnidad: [...grupos.values()], lotesSinHistorial, lotesSinDatosComparables, totalLotes: lotes.length };
}

export function listarEstacionesClima(finca_id) {
  return listar('estaciones_clima', (estacion) => estacion.finca_id === finca_id);
}

export function crearEstacionClima({ finca_id, codigo, nombre, lat, lng, altitud_m = null, proveedor = 'IDEAM' }) {
  if (!obtener('fincas', finca_id)) throw new Error('La finca seleccionada no existe.');
  const codigoValidado = validarTexto(codigo, 'El código de la estación');
  const nombreValidado = validarTexto(nombre, 'El nombre de la estación');
  const latitud = validarNumero(lat, 'La latitud', { min: -90 });
  const longitud = validarNumero(lng, 'La longitud', { min: -180 });
  if (latitud > 90 || longitud > 180) throw new Error('Las coordenadas de la estación están fuera de rango.');
  if (listarEstacionesClima(finca_id).some((estacion) => estacion.codigo.toLowerCase() === codigoValidado.toLowerCase())) {
    throw new Error('Ya existe una estación con ese código.');
  }
  return crear('estaciones_clima', {
    finca_id, codigo: codigoValidado, nombre: nombreValidado, lat: latitud, lng: longitud,
    altitud_m: altitud_m === '' || altitud_m === null ? null : validarNumero(altitud_m, 'La altitud', { min: 0 }),
    proveedor: validarTexto(proveedor, 'La fuente climática'),
  });
}

export function actualizarEstacionClima(id, cambios) {
  const estacion = obtener('estaciones_clima', id);
  if (!estacion) throw new Error('Estación no encontrada.');
  const datos = { ...cambios };
  if (datos.proveedor !== undefined) datos.proveedor = validarTexto(datos.proveedor, 'La fuente climática');
  if (datos.codigo !== undefined) datos.codigo = validarTexto(datos.codigo, 'El código de la estación');
  if (datos.nombre !== undefined) datos.nombre = validarTexto(datos.nombre, 'El nombre de la estación');
  if (datos.lat !== undefined) {
    datos.lat = validarNumero(datos.lat, 'La latitud', { min: -90 });
    if (datos.lat > 90) throw new Error('La latitud está fuera de rango.');
  }
  if (datos.lng !== undefined) {
    datos.lng = validarNumero(datos.lng, 'La longitud', { min: -180 });
    if (datos.lng > 180) throw new Error('La longitud está fuera de rango.');
  }
  if (datos.altitud_m !== undefined) datos.altitud_m = datos.altitud_m === '' || datos.altitud_m === null ? null : validarNumero(datos.altitud_m, 'La altitud', { min: 0 });
  if (datos.codigo && listarEstacionesClima(estacion.finca_id).some((otra) => otra.id !== id && otra.codigo.toLowerCase() === datos.codigo.toLowerCase())) {
    throw new Error('Ya existe una estación con ese código.');
  }
  return actualizar('estaciones_clima', id, datos);
}

export function eliminarEstacionClima(id) {
  if (listar('observaciones_clima', (observacion) => observacion.estacion_id === id).length) {
    throw new Error('La estación tiene observaciones asociadas. Elimina primero los registros climáticos.');
  }
  eliminar('estaciones_clima', id);
}

function validarObservacionClima(datos) {
  const fecha = validarFecha(datos.fecha);
  const optionalNumber = (valor, label, options) => valor === '' || valor === null || valor === undefined
    ? null
    : validarNumero(valor, label, options);
  const lluvia_mm = optionalNumber(datos.lluvia_mm, 'La precipitación', { min: 0 });
  const temp_min_c = optionalNumber(datos.temp_min_c, 'La temperatura mínima');
  const temp_max_c = optionalNumber(datos.temp_max_c, 'La temperatura máxima');
  const humedad_pct = optionalNumber(datos.humedad_pct, 'La humedad relativa', { min: 0 });
  const viento_ms = optionalNumber(datos.viento_ms, 'La velocidad del viento', { min: 0 });
  if (humedad_pct !== null && humedad_pct > 100) throw new Error('La humedad debe estar entre 0 y 100%.');
  if (temp_min_c !== null && temp_max_c !== null && temp_min_c > temp_max_c) {
    throw new Error('La temperatura mínima no puede superar la máxima.');
  }
  if ([lluvia_mm, temp_min_c, temp_max_c, humedad_pct, viento_ms].every((valor) => valor === null)) {
    throw new Error('Registra al menos una variable climática.');
  }
  return { fecha, lluvia_mm, temp_min_c, temp_max_c, humedad_pct, viento_ms };
}

export function listarObservacionesClima(estacion_id) {
  return listar('observaciones_clima', (observacion) => observacion.estacion_id === estacion_id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function importarObservacionesClima(estacion_id, filas) {
  const estacion = obtener('estaciones_clima', estacion_id);
  if (!estacion) throw new Error('Estación no encontrada.');
  if (!Array.isArray(filas) || filas.length < 1 || filas.length > 5000) {
    throw new Error('El archivo debe incluir entre 1 y 5.000 filas de observaciones.');
  }
  const normalizadas = filas.map((fila) => validarObservacionClima(fila));
  const fechas = new Set();
  for (const observacion of normalizadas) {
    if (fechas.has(observacion.fecha)) throw new Error(`El archivo contiene más de una fila para ${observacion.fecha}.`);
    fechas.add(observacion.fecha);
  }
  return enTransaccion(() => {
    let insertadas = 0;
    let actualizadas = 0;
    for (const datos of normalizadas) {
      const existente = listar('observaciones_clima', (observacion) =>
        observacion.estacion_id === estacion_id && observacion.fecha === datos.fecha,
      )[0];
      if (existente) {
        actualizar('observaciones_clima', existente.id, { ...datos, proveedor: estacion.proveedor, importada: true });
        actualizadas += 1;
      } else {
        crear('observaciones_clima', {
          finca_id: estacion.finca_id, estacion_id, ...datos,
          proveedor: estacion.proveedor, importada: true,
        });
        insertadas += 1;
      }
    }
    return { insertadas, actualizadas };
  });
}

export function guardarSerieClimaNASA(finca_id, consulta, referencia) {
  return enTransaccion(() => {
    const codigo = `NASA-${consulta.lat.toFixed(4)}-${consulta.lng.toFixed(4)}`;
    let estacion = listarEstacionesClima(finca_id).find((item) => item.codigo === codigo);
    if (!estacion) {
      estacion = crearEstacionClima({
        finca_id,
        codigo,
        nombre: `NASA POWER · ${referencia}`,
        lat: consulta.lat,
        lng: consulta.lng,
        altitud_m: consulta.altitud_m,
        proveedor: 'NASA POWER · MERRA-2/SYN1DEG',
      });
    }
    const importacion = importarObservacionesClima(estacion.id, consulta.filas);
    return { estacion, ...importacion };
  });
}

export function actualizarObservacionClima(id, cambios) {
  const observacion = obtener('observaciones_clima', id);
  if (!observacion) throw new Error('Observación climática no encontrada.');
  const datos = validarObservacionClima({ ...observacion, ...cambios });
  if (listarObservacionesClima(observacion.estacion_id).some((otra) => otra.id !== id && otra.fecha === datos.fecha)) {
    throw new Error('Ya existe una observación para esa estación y fecha.');
  }
  return actualizar('observaciones_clima', id, datos);
}

export function eliminarObservacionClima(id) {
  eliminar('observaciones_clima', id);
}

function distanciaKm(a, b) {
  const rad = (valor) => (valor * Math.PI) / 180;
  const deltaLat = rad(b.lat - a.lat);
  const deltaLng = rad(b.lng - a.lng);
  const formula = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(formula), Math.sqrt(1 - formula));
}

export function estacionMasCercana(finca_id, lote_id = null) {
  const finca = obtener('fincas', finca_id);
  if (!finca) throw new Error('La finca seleccionada no existe.');
  const lote = lote_id ? loteDeFinca(lote_id, finca_id) : null;
  const puntos = (lote?.poligono || []).filter((punto) =>
    punto.lat !== null && punto.lat !== undefined &&
    punto.lng !== null && punto.lng !== undefined &&
    Number.isFinite(Number(punto.lat)) && Number.isFinite(Number(punto.lng)),
  );
  const origen = puntos.length
    ? { lat: puntos.reduce((suma, punto) => suma + Number(punto.lat), 0) / puntos.length, lng: puntos.reduce((suma, punto) => suma + Number(punto.lng), 0) / puntos.length }
    : finca.origen_gps;
  if (!origen) return null;
  const estaciones = listarEstacionesClima(finca_id);
  if (!estaciones.length) return null;
  return estaciones
    .map((estacion) => ({ ...estacion, distancia_km: distanciaKm(origen, estacion) }))
    .sort((a, b) => a.distancia_km - b.distancia_km)[0];
}

export function estacionMasCercanaConObservaciones(finca_id, lote_id = null) {
  const origen = coordenadasClima(finca_id, lote_id);
  if (!origen) return null;
  return listarEstacionesClima(finca_id)
    .filter((estacion) =>
      Number.isFinite(Number(estacion.lat)) && Number.isFinite(Number(estacion.lng)) &&
      listarObservacionesClima(estacion.id).length > 0,
    )
    .map((estacion) => ({ ...estacion, distancia_km: distanciaKm(origen, estacion) }))
    .sort((a, b) => a.distancia_km - b.distancia_km)[0] || null;
}

export function coordenadasClima(finca_id, lote_id = null) {
  const finca = obtener('fincas', finca_id);
  if (!finca) throw new Error('La finca seleccionada no existe.');
  const lote = lote_id ? loteDeFinca(lote_id, finca_id) : null;
  const puntos = (lote?.poligono || []).filter((punto) =>
    punto.lat !== null && punto.lat !== undefined &&
    punto.lng !== null && punto.lng !== undefined &&
    Number.isFinite(Number(punto.lat)) && Number.isFinite(Number(punto.lng)),
  );
  if (puntos.length) {
    return {
      lat: puntos.reduce((suma, punto) => suma + Number(punto.lat), 0) / puntos.length,
      lng: puntos.reduce((suma, punto) => suma + Number(punto.lng), 0) / puntos.length,
      altitud_m: lote?.altitud_m ?? null,
      referencia: lote?.nombre || 'lote',
    };
  }
  if (finca.origen_gps) {
    return { ...finca.origen_gps, altitud_m: lote?.altitud_m ?? null, referencia: lote?.nombre || finca.nombre };
  }
  return null;
}

export function analizarAsociacionClimaSanidad(finca_id, lote_id, agente) {
  const registros = listarRegistrosFitosanitarios(finca_id, lote_id)
    .filter((registro) =>
      registro.agente.toLocaleLowerCase() === agente.toLocaleLowerCase() &&
      registro.incidencia_pct !== null &&
      registro.diagnostico !== 'descartado',
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const coordenadas = coordenadasClima(finca_id, lote_id);
  if (!coordenadas) {
    return { disponible: false, motivo: 'Registra coordenadas GPS del lote para asociar la fuente climática más cercana.' };
  }
  const estacion = estacionMasCercanaConObservaciones(finca_id, lote_id);
  if (!estacion) {
    return { disponible: false, motivo: 'No hay observaciones climáticas guardadas para estaciones con coordenadas.' };
  }
  const observaciones = listarObservacionesClima(estacion.id);
  const porFecha = new Map(observaciones.map((item) => [item.fecha, item]));
  const ventanaPrevias = (fecha) => {
    const fechaFin = new Date(`${fecha}T00:00:00Z`);
    fechaFin.setUTCDate(fechaFin.getUTCDate() - 1);
    const fechaInicio = new Date(fechaFin);
    fechaInicio.setUTCDate(fechaInicio.getUTCDate() - 6);
    const dias = [];
    for (let dia = new Date(fechaInicio); dia <= fechaFin; dia.setUTCDate(dia.getUTCDate() + 1)) {
      dias.push(porFecha.get(dia.toISOString().slice(0, 10)));
    }
    return dias;
  };
  const valorClima = (dias, variable) => {
    const datos = dias.filter(Boolean);
    if (variable === 'lluvia_mm') {
      const valores = datos.map((dia) => dia.lluvia_mm).filter((valor) => valor !== null);
      return valores.length >= 5 ? valores.reduce((suma, valor) => suma + valor, 0) : null;
    }
    if (variable === 'humedad_pct') {
      const valores = datos.map((dia) => dia.humedad_pct).filter((valor) => valor !== null);
      return valores.length >= 5 ? valores.reduce((suma, valor) => suma + valor, 0) / valores.length : null;
    }
    const valores = datos
      .filter((dia) => dia.temp_min_c !== null && dia.temp_max_c !== null)
      .map((dia) => (dia.temp_min_c + dia.temp_max_c) / 2);
    return valores.length >= 5 ? valores.reduce((suma, valor) => suma + valor, 0) / valores.length : null;
  };
  const paresPorVariable = {
    lluvia_mm: [],
    humedad_pct: [],
    temp_media_c: [],
  };
  const variables = [
    ['lluvia_mm', 'Lluvia acumulada (mm / 7 días)', 'lluvia_mm'],
    ['humedad_pct', 'Humedad relativa media (%)', 'humedad_pct'],
    ['temp_media_c', 'Temperatura media (°C)', 'temp_media_c'],
  ];
  for (const registro of registros) {
    const dias = ventanaPrevias(registro.fecha);
    for (const [clave, , variable] of variables) {
      const clima = valorClima(dias, variable);
      if (clima !== null) paresPorVariable[clave].push({ x: clima, y: registro.incidencia_pct });
    }
  }
  const asociacion = variables.map(([clave, etiqueta]) => {
    const pares = paresPorVariable[clave];
    if (pares.length < 5) return { clave, etiqueta, n: pares.length, correlacion: null };
    const mediaX = pares.reduce((suma, par) => suma + par.x, 0) / pares.length;
    const mediaY = pares.reduce((suma, par) => suma + par.y, 0) / pares.length;
    const covarianza = pares.reduce((suma, par) => suma + (par.x - mediaX) * (par.y - mediaY), 0);
    const sumaX = pares.reduce((suma, par) => suma + (par.x - mediaX) ** 2, 0);
    const sumaY = pares.reduce((suma, par) => suma + (par.y - mediaY) ** 2, 0);
    const correlacion = sumaX && sumaY
      ? Math.max(-1, Math.min(1, covarianza / Math.sqrt(sumaX * sumaY)))
      : null;
    return { clave, etiqueta, n: pares.length, correlacion };
  });
  const exposicionActual = (variable) => {
    const fechas = observaciones.map((item) => item.fecha).sort();
    if (!fechas.length) return null;
    const fin = new Date(`${fechas[fechas.length - 1]}T00:00:00Z`);
    const inicio = new Date(fin);
    inicio.setUTCDate(inicio.getUTCDate() - 6);
    const dias = [];
    for (let dia = new Date(inicio); dia <= fin; dia.setUTCDate(dia.getUTCDate() + 1)) {
      dias.push(porFecha.get(dia.toISOString().slice(0, 10)));
    }
    return { valor: valorClima(dias, variable), fecha: fechas[fechas.length - 1] };
  };
  const senales = asociacion.filter((item) => {
    const variable = item.clave === 'temp_media_c' ? 'temp_media_c' : item.clave;
    const pares = paresPorVariable[item.clave];
    const actual = exposicionActual(variable);
    if (item.n < 8 || item.correlacion === null || item.correlacion < 0.65 || actual?.valor === null) return false;
    const historicos = pares.map((par) => par.x).sort((a, b) => a - b);
    const cuartil75 = historicos[Math.ceil(historicos.length * 0.75) - 1];
    return cuartil75 !== undefined && actual.valor >= cuartil75;
  }).map((item) => ({ ...item, exposicion_actual: exposicionActual(item.clave) }));
  return {
    disponible: true,
    fuente: estacion.nombre,
    proveedor: estacion.proveedor,
    distancia_km: estacion.distancia_km,
    ventana_dias: 7,
    cantidad_muestreos: registros.length,
    asociacion,
    senales,
    fecha_clima_mas_reciente: observaciones[0]?.fecha || null,
  };
}

export function listarRegistrosFitosanitarios(finca_id, lote_id = null) {
  return listar('registros_fitosanitarios', (registro) =>
    registro.finca_id === finca_id && (!lote_id || registro.lote_id === lote_id),
  ).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function crearRegistroFitosanitario(datos) {
  const finca = obtener('fincas', datos.finca_id);
  const lote = loteDeFinca(datos.lote_id, datos.finca_id);
  if (!finca || !lote) throw new Error('Selecciona un lote válido de la finca.');
  return crear('registros_fitosanitarios', validarRegistroFitosanitario(datos, lote));
}

export function actualizarRegistroFitosanitario(id, cambios) {
  const registro = obtener('registros_fitosanitarios', id);
  if (!registro) throw new Error('Registro fitosanitario no encontrado.');
  const lote = loteDeFinca(cambios.lote_id ?? registro.lote_id, registro.finca_id);
  const datos = validarRegistroFitosanitario({ ...registro, ...cambios }, lote);
  return actualizar('registros_fitosanitarios', id, datos);
}

export function eliminarRegistroFitosanitario(id) {
  eliminar('registros_fitosanitarios', id);
}

function validarRegistroFitosanitario(datos, lote) {
  const agente = validarTexto(datos.agente, 'La plaga o enfermedad');
  const fecha = validarFecha(datos.fecha);
  if (fecha > hoyISO()) throw new Error('La fecha de observación no puede estar en el futuro.');
  const tipos = ['plaga', 'enfermedad', 'síntoma', 'otro'];
  const diagnosticos = ['por_confirmar', 'confirmado', 'descartado'];
  const severidades = ['sin_dato', 'leve', 'moderada', 'alta'];
  const incidencia = datos.incidencia_pct === '' || datos.incidencia_pct === null || datos.incidencia_pct === undefined
    ? null
    : validarNumero(datos.incidencia_pct, 'La incidencia', { min: 0 });
  const umbral = datos.umbral_control_pct === '' || datos.umbral_control_pct === null || datos.umbral_control_pct === undefined
    ? null
    : validarNumero(datos.umbral_control_pct, 'El umbral de seguimiento', { min: 0 });
  if (incidencia !== null && incidencia > 100) throw new Error('La incidencia debe estar entre 0 y 100%.');
  if (umbral !== null && umbral > 100) throw new Error('El umbral debe estar entre 0 y 100%.');
  return {
    finca_id: datos.finca_id, lote_id: lote.id, fecha, agente,
    tipo: validarOpcion(datos.tipo, tipos, 'El tipo de problema'),
    diagnostico: validarOpcion(datos.diagnostico, diagnosticos, 'El estado del diagnóstico'),
    severidad: validarOpcion(datos.severidad || 'sin_dato', severidades, 'La severidad'),
    incidencia_pct: incidencia, umbral_control_pct: umbral,
    observaciones: sanitizeText(datos.observaciones),
    acciones: sanitizeText(datos.acciones),
    etapa_cultivo: sanitizeText(datos.etapa_cultivo),
  };
}

export function analizarSeguimientoFitosanitario(finca_id, lote_id, agente) {
  const registros = listarRegistrosFitosanitarios(finca_id, lote_id)
    .filter((registro) => registro.agente.toLocaleLowerCase() === agente.toLocaleLowerCase())
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cuantificados = registros.filter((registro) => registro.incidencia_pct !== null);
  const actual = cuantificados[cuantificados.length - 1] || registros[registros.length - 1] || null;
  const umbral = [...registros].reverse().find((registro) => registro.umbral_control_pct !== null)?.umbral_control_pct ?? null;
  let proyeccion = null;
  if (cuantificados.length >= 3 && umbral !== null && actual?.incidencia_pct !== null) {
    const dias = cuantificados.map((registro) => (Date.parse(`${registro.fecha}T00:00:00Z`) - Date.parse(`${cuantificados[0].fecha}T00:00:00Z`)) / 86400000);
    const mediaX = dias.reduce((suma, valor) => suma + valor, 0) / dias.length;
    const valores = cuantificados.map((registro) => registro.incidencia_pct);
    const mediaY = valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
    const varianza = dias.reduce((suma, valor) => suma + (valor - mediaX) ** 2, 0);
    const pendiente = varianza
      ? dias.reduce((suma, valor, indice) => suma + (valor - mediaX) * (valores[indice] - mediaY), 0) / varianza
      : 0;
    const diasHastaUmbral = pendiente > 0 && actual.incidencia_pct < umbral
      ? Math.ceil((umbral - actual.incidencia_pct) / pendiente)
      : null;
    proyeccion = {
      pendiente_pct_dia: pendiente,
      dias_hasta_umbral: diasHastaUmbral,
      cruce_proximo: diasHastaUmbral !== null && diasHastaUmbral <= 14,
      metodo: 'extrapolación lineal descriptiva de observaciones',
    };
  }
  const excedeUmbral = umbral !== null && actual?.incidencia_pct !== null && actual?.incidencia_pct >= umbral;
  const descartado = actual?.diagnostico === 'descartado';
  return {
    lote_id, agente, registros, actual, umbral_control_pct: umbral,
    alerta: !descartado && Boolean(excedeUmbral || proyeccion?.cruce_proximo),
    motivo_alerta: descartado
      ? null
      : excedeUmbral
      ? 'La incidencia observada iguala o supera el umbral configurado.'
      : proyeccion?.cruce_proximo
        ? `La tendencia lineal alcanzaría el umbral en aproximadamente ${proyeccion.dias_hasta_umbral} día(s).`
        : null,
    proyeccion,
  };
}
export function eliminarLote(id) {
  // Al borrar un lote se desvinculan (no se borran) sus movimientos y labores,
  // para no perder el histórico financiero.
  db.labores.filter((l) => l.lote_id === id).forEach((l) => (l.lote_id = null));
  db.movimientos_financieros.filter((m) => m.lote_id === id).forEach((m) => (m.lote_id = null));
  eliminar('lotes', id);
}

// -------------------------------------------------------------
// Inventario: insumos y herramientas
// -------------------------------------------------------------
export function listarInsumos(finca_id) {
  return listar('insumos', (i) => i.finca_id === finca_id);
}
export function crearInsumo({ finca_id, nombre, categoria, unidad, stock_actual, costo_unitario }) {
  if (!obtener('fincas', finca_id)) throw new Error('La finca seleccionada no existe.');
  const nombreValidado = validarTexto(nombre, 'El nombre del insumo');
  const stock = validarNumero(stock_actual, 'El stock');
  const costo = validarNumero(costo_unitario, 'El costo unitario', { entero: true });
  return crear('insumos', {
    finca_id, nombre: nombreValidado, categoria, unidad,
    stock_actual: stock,
    costo_unitario: costo,
  });
}
export function actualizarInsumo(id, cambios) {
  const insumo = obtener('insumos', id);
  if (!insumo) throw new Error('Insumo no encontrado.');
  const datos = { ...cambios };
  if (datos.nombre !== undefined) datos.nombre = validarTexto(datos.nombre, 'El nombre del insumo');
  if (datos.stock_actual !== undefined) datos.stock_actual = validarNumero(datos.stock_actual, 'El stock');
  if (datos.costo_unitario !== undefined) datos.costo_unitario = validarNumero(datos.costo_unitario, 'El costo unitario', { entero: true });
  return actualizar('insumos', id, datos);
}
export function eliminarInsumo(id) {
  eliminar('insumos', id);
}

export function listarHerramientas(finca_id) {
  return listar('herramientas', (h) => h.finca_id === finca_id);
}
export function crearHerramienta({ finca_id, nombre, categoria, cantidad_disponible, costo_uso_unitario }) {
  if (!obtener('fincas', finca_id)) throw new Error('La finca seleccionada no existe.');
  const nombreValidado = validarTexto(nombre, 'El nombre de la herramienta');
  const cantidad = validarNumero(cantidad_disponible, 'La cantidad disponible', { entero: true });
  const costo = validarNumero(costo_uso_unitario, 'El costo de uso', { entero: true });
  return crear('herramientas', {
    finca_id, nombre: nombreValidado, categoria,
    cantidad_disponible: cantidad,
    costo_uso_unitario: costo,
  });
}
export function actualizarHerramienta(id, cambios) {
  const herramienta = obtener('herramientas', id);
  if (!herramienta) throw new Error('Herramienta no encontrada.');
  const datos = { ...cambios };
  if (datos.nombre !== undefined) datos.nombre = validarTexto(datos.nombre, 'El nombre de la herramienta');
  if (datos.cantidad_disponible !== undefined) datos.cantidad_disponible = validarNumero(datos.cantidad_disponible, 'La cantidad disponible', { entero: true });
  if (datos.costo_uso_unitario !== undefined) datos.costo_uso_unitario = validarNumero(datos.costo_uso_unitario, 'El costo de uso', { entero: true });
  return actualizar('herramientas', id, datos);
}
export function eliminarHerramienta(id) {
  eliminar('herramientas', id);
}

// -------------------------------------------------------------
// Personal (mano de obra) — directorio de trabajadores
// -------------------------------------------------------------
export function listarPersonal(finca_id) {
  return listar('personal', (p) => p.finca_id === finca_id);
}
export function crearPersonal({ finca_id, nombre, rol, contacto, jornal_habitual, disponible }) {
  if (!obtener('fincas', finca_id)) throw new Error('La finca seleccionada no existe.');
  const nombreValidado = validarTexto(nombre, 'El nombre del trabajador');
  const jornal = validarNumero(jornal_habitual, 'El valor del jornal', { entero: true });
  return crear('personal', {
    finca_id, nombre: nombreValidado, rol: rol || '', contacto: contacto || '',
    jornal_habitual: jornal,
    disponible: disponible !== false,
  });
}
export function actualizarPersonal(id, cambios) {
  const persona = obtener('personal', id);
  if (!persona) throw new Error('Persona no encontrada.');
  const datos = { ...cambios };
  if (datos.nombre !== undefined) datos.nombre = validarTexto(datos.nombre, 'El nombre del trabajador');
  if (datos.jornal_habitual !== undefined) datos.jornal_habitual = validarNumero(datos.jornal_habitual, 'El valor del jornal', { entero: true });
  return actualizar('personal', id, datos);
}
export function eliminarPersonal(id) {
  eliminar('personal', id);
}

// -------------------------------------------------------------
// Labores (con mano de obra y consumo de inventario asociados)
// -------------------------------------------------------------
export function listarLabores(finca_id) {
  return listar('labores', (l) => l.finca_id === finca_id)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}
export function getManoObraDeLabor(labor_id) {
  return listar('mano_obra', (m) => m.labor_id === labor_id);
}
export function getConsumosDeLabor(labor_id) {
  const planificados = listar('consumos_labor', (c) => c.labor_id === labor_id);
  return planificados.length
    ? planificados
    : listar('movimientos_inventario', (m) => m.labor_id === labor_id);
}

function validarStockLabor(consumos, finca_id) {
  const cantidadesPorInsumo = new Map();
  for (const consumo of consumos) {
    if (consumo.item_tipo === 'insumo') {
      const insumo = obtener('insumos', consumo.item_id);
      if (!insumo || insumo.finca_id !== finca_id) {
        throw new Error('El insumo de la labor no pertenece a esta finca.');
      }
      cantidadesPorInsumo.set(insumo.id, (cantidadesPorInsumo.get(insumo.id) || 0) + consumo.cantidad);
    }
  }
  for (const [insumoId, cantidad] of cantidadesPorInsumo) {
    const insumo = obtener('insumos', insumoId);
    if (cantidad > insumo.stock_actual) {
      throw new Error(`Stock insuficiente de "${insumo.nombre}" (disponible: ${insumo.stock_actual} ${insumo.unidad})`);
    }
  }
}

function aplicarConsumosLabor(labor, consumos) {
  validarStockLabor(consumos, labor.finca_id);
  for (const consumo of consumos) {
    if (consumo.item_tipo === 'insumo') {
      const insumo = obtener('insumos', consumo.item_id);
      insumo.stock_actual -= consumo.cantidad;
    }
    const monto = Math.round(consumo.cantidad * consumo.costo_unitario);
    crear('movimientos_inventario', {
      labor_id: labor.id, item_tipo: consumo.item_tipo, item_id: consumo.item_id,
      item_nombre: consumo.item_nombre, cantidad: consumo.cantidad,
      unidad: consumo.unidad, costo_unitario: consumo.costo_unitario,
    });
    if (monto > 0) {
      crear('movimientos_financieros', {
        finca_id: labor.finca_id, lote_id: labor.lote_id, tipo: 'costo',
        categoria: consumo.item_tipo === 'insumo' ? 'insumos' : 'herramientas',
        descripcion: consumo.item_tipo === 'insumo'
          ? `Insumo — ${consumo.item_nombre} (${consumo.cantidad} ${consumo.unidad}) en "${labor.nombre}"`
          : `Uso de herramienta — ${consumo.item_nombre} en "${labor.nombre}"`,
        monto, fecha: labor.fecha, origen: 'auto_insumo', ref_labor_id: labor.id,
      });
    }
  }
}

function generarCostoManoObra(labor) {
  for (const mano of getManoObraDeLabor(labor.id)) {
    const monto = Math.round(mano.jornales * mano.valor_jornal);
    if (monto > 0) {
      crear('movimientos_financieros', {
        finca_id: labor.finca_id, lote_id: labor.lote_id, tipo: 'costo', categoria: 'mano_obra',
        descripcion: `Mano de obra — ${mano.trabajador || 'jornal'} en "${labor.nombre}"`,
        monto, fecha: labor.fecha, origen: 'auto_labor', ref_labor_id: labor.id,
      });
    }
  }
}

function validarDatosLabor({ finca_id, lote_id, nombre, tipo, fecha, estado, descripcion, manoObra = [], consumos = [], validarStock = true }) {
  if (!obtener('fincas', finca_id)) throw new Error('La finca seleccionada no existe.');
  const nombreValidado = validarTexto(nombre, 'El nombre de la labor');
  const tipoValidado = validarTexto(tipo, 'El tipo de labor');
  loteDeFinca(lote_id, finca_id);
  const fechaValidada = validarFecha(fecha || hoyISO());
  const estadosValidos = ['pendiente', 'en curso', 'completada'];
  const estadoValidado = estado || 'pendiente';
  if (!estadosValidos.includes(estadoValidado)) throw new Error('El estado de la labor no es válido.');
  const consumosValidados = [];

  for (const c of consumos) {
    if (!['insumo', 'herramienta'].includes(c.item_tipo)) throw new Error('El tipo de ítem consumido no es válido.');
    const cantidad = validarNumero(c.cantidad, 'La cantidad consumida');
    if (cantidad <= 0) throw new Error('La cantidad consumida debe ser mayor a cero.');
    let item;
    if (c.item_tipo === 'insumo') {
      item = obtener('insumos', c.item_id);
    } else {
      item = obtener('herramientas', c.item_id);
    }
    if (!item || item.finca_id !== finca_id) throw new Error('El ítem seleccionado no pertenece a esta finca.');
    consumosValidados.push({
      item_tipo: c.item_tipo, item_id: item.id, item_nombre: item.nombre,
      cantidad, unidad: c.item_tipo === 'insumo' ? item.unidad : 'uso',
      costo_unitario: c.item_tipo === 'insumo' ? item.costo_unitario : item.costo_uso_unitario,
    });
  }
  const manoObraValidada = [];
  for (const m of manoObra) {
    const jornales = validarNumero(m.jornales, 'Los jornales');
    const valorJornal = validarNumero(m.valor_jornal, 'El valor por jornal', { entero: true });
    let trabajador = sanitizeText(m.trabajador);
    if (m.personal_id) {
      const persona = obtener('personal', m.personal_id);
      if (!persona || persona.finca_id !== finca_id) throw new Error('El trabajador seleccionado no pertenece a esta finca.');
      trabajador = persona.nombre;
    }
    if (jornales > 0 && !m.personal_id) {
      trabajador = validarTexto(trabajador, 'El nombre del trabajador');
    }
    if (!Number.isSafeInteger(Math.round(jornales * valorJornal))) throw new Error('El costo de mano de obra excede el valor permitido.');
    if (jornales > 0) manoObraValidada.push({
      personal_id: m.personal_id || null, trabajador, jornales, valor_jornal: valorJornal,
    });
  }

  if (estadoValidado === 'completada' && validarStock) validarStockLabor(consumosValidados, finca_id);
  return {
    finca_id, lote_id: lote_id || null, nombre: nombreValidado, tipo: tipoValidado,
    fecha: fechaValidada, estado: estadoValidado, descripcion: sanitizeText(descripcion),
    manoObra: manoObraValidada, consumos: consumosValidados,
  };
}

function guardarDatosLabor(labor, datos) {
  actualizar('labores', labor.id, {
    finca_id: datos.finca_id, lote_id: datos.lote_id, nombre: datos.nombre,
    tipo: datos.tipo, fecha: datos.fecha, estado: datos.estado, descripcion: datos.descripcion,
  });
  for (const mano of datos.manoObra) crear('mano_obra', { labor_id: labor.id, ...mano });
  for (const consumo of datos.consumos) crear('consumos_labor', { labor_id: labor.id, ...consumo });

  if (datos.estado === 'completada') {
    aplicarConsumosLabor(labor, datos.consumos);
    generarCostoManoObra(labor);
  }
  return labor;
}

export function crearLabor(datos) {
  const datosValidados = validarDatosLabor(datos);
  return enTransaccion(() => {
    const labor = crear('labores', {
      finca_id: datosValidados.finca_id, lote_id: datosValidados.lote_id,
      nombre: datosValidados.nombre, tipo: datosValidados.tipo,
      fecha: datosValidados.fecha, estado: datosValidados.estado,
      descripcion: datosValidados.descripcion,
    });
    return guardarDatosLabor(labor, datosValidados);
  });
}

export function actualizarLabor(id, cambios) {
  const labor = obtener('labores', id);
  if (!labor) throw new Error('Labor no encontrada.');
  const datosValidados = validarDatosLabor({
    finca_id: labor.finca_id,
    lote_id: cambios.lote_id === undefined ? labor.lote_id : cambios.lote_id,
    nombre: cambios.nombre === undefined ? labor.nombre : cambios.nombre,
    tipo: cambios.tipo === undefined ? labor.tipo : cambios.tipo,
    fecha: cambios.fecha === undefined ? labor.fecha : cambios.fecha,
    estado: cambios.estado === undefined ? labor.estado : cambios.estado,
    descripcion: cambios.descripcion === undefined ? labor.descripcion : cambios.descripcion,
    manoObra: cambios.manoObra === undefined ? getManoObraDeLabor(id) : cambios.manoObra,
    consumos: cambios.consumos === undefined ? getConsumosDeLabor(id) : cambios.consumos,
    validarStock: false,
  });

  return enTransaccion(() => {
    const movimientos = listar('movimientos_inventario', (m) => m.labor_id === id);
    for (const movimiento of movimientos) {
      if (movimiento.item_tipo === 'insumo') {
        const insumo = obtener('insumos', movimiento.item_id);
        if (insumo) insumo.stock_actual += movimiento.cantidad;
      }
    }
    db.movimientos_inventario = db.movimientos_inventario.filter((m) => m.labor_id !== id);
    db.movimientos_financieros = db.movimientos_financieros.filter((m) => m.ref_labor_id !== id);
    db.mano_obra = db.mano_obra.filter((m) => m.labor_id !== id);
    db.consumos_labor = db.consumos_labor.filter((c) => c.labor_id !== id);
    if (datosValidados.estado === 'completada') validarStockLabor(datosValidados.consumos, datosValidados.finca_id);
    return guardarDatosLabor(labor, datosValidados);
  });
}

export function actualizarEstadoLabor(id, estado) {
  const estadosValidos = ['pendiente', 'en curso', 'completada'];
  if (!estadosValidos.includes(estado)) throw new Error('El estado de la labor no es válido.');
  const labor = obtener('labores', id);
  if (!labor) throw new Error('Labor no encontrada.');
  if (labor.estado === estado) return labor;

  return enTransaccion(() => {
    const movimientos = listar('movimientos_inventario', (m) => m.labor_id === id);
    if (estado === 'completada' && labor.estado !== 'completada') {
      if (movimientos.length === 0) {
        const consumos = getConsumosDeLabor(id);
        aplicarConsumosLabor(labor, consumos);
        generarCostoManoObra(labor);
      }
    } else if (labor.estado === 'completada' && estado !== 'completada') {
      const yaTienePlan = listar('consumos_labor', (c) => c.labor_id === id).length > 0;
      for (const movimiento of movimientos) {
        if (movimiento.item_tipo === 'insumo') {
          const insumo = obtener('insumos', movimiento.item_id);
          if (insumo) insumo.stock_actual += movimiento.cantidad;
        }
        if (!yaTienePlan) {
          crear('consumos_labor', {
            labor_id: id, item_tipo: movimiento.item_tipo, item_id: movimiento.item_id,
            item_nombre: movimiento.item_nombre, cantidad: movimiento.cantidad,
            unidad: movimiento.unidad, costo_unitario: movimiento.costo_unitario,
          });
        }
      }
      db.movimientos_inventario = db.movimientos_inventario.filter((m) => m.labor_id !== id);
      db.movimientos_financieros = db.movimientos_financieros.filter((m) => m.ref_labor_id !== id);
    }
    return actualizar('labores', id, { estado });
  });
}

export function costoDeLabor(labor_id) {
  return listar('movimientos_financieros', (m) => m.ref_labor_id === labor_id).reduce((s, m) => s + m.monto, 0);
}

export function costoEstimadoLabor(labor_id) {
  const costoManoObra = getManoObraDeLabor(labor_id)
    .reduce((total, mano) => total + Math.round(mano.jornales * mano.valor_jornal), 0);
  const costoInsumos = getConsumosDeLabor(labor_id)
    .reduce((total, consumo) => total + Math.round(consumo.cantidad * consumo.costo_unitario), 0);
  return costoManoObra + costoInsumos;
}

export function eliminarLabor(id) {
  return enTransaccion(() => {
    // Revertir stock de insumos consumidos antes de borrar.
    const consumos = listar('movimientos_inventario', (m) => m.labor_id === id);
    for (const c of consumos) {
      if (c.item_tipo === 'insumo') {
        const insumo = obtener('insumos', c.item_id);
        if (insumo) insumo.stock_actual += c.cantidad;
      }
    }
    db.movimientos_inventario = db.movimientos_inventario.filter((m) => m.labor_id !== id);
    db.mano_obra = db.mano_obra.filter((m) => m.labor_id !== id);
    db.consumos_labor = db.consumos_labor.filter((c) => c.labor_id !== id);
    db.movimientos_financieros = db.movimientos_financieros.filter((m) => m.ref_labor_id !== id);
    eliminar('labores', id);
  });
}

// -------------------------------------------------------------
// Movimientos financieros (manuales: ingreso, costo, gasto, impuesto, interés)
// -------------------------------------------------------------
export function listarMovimientos(finca_id) {
  return listar('movimientos_financieros', (m) => m.finca_id === finca_id)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}
function validarMovimiento({ finca_id, lote_id, tipo, monto, fecha }) {
  if (!obtener('fincas', finca_id)) throw new Error('La finca seleccionada no existe.');
  loteDeFinca(lote_id, finca_id);
  const tiposValidos = ['ingreso', 'costo', 'gasto', 'impuesto', 'interes'];
  if (!tiposValidos.includes(tipo)) throw new Error('El tipo de movimiento financiero no es válido.');
  const montoValidado = validarNumero(monto, 'El monto', { min: 1, entero: true });
  const fechaValidada = validarFecha(fecha || hoyISO());
  return { finca_id, lote_id: lote_id || null, tipo, monto: montoValidado, fecha: fechaValidada };
}

export function crearMovimiento({ finca_id, lote_id, tipo, categoria, descripcion, monto, fecha }) {
  const datos = validarMovimiento({ finca_id, lote_id, tipo, monto, fecha });
  return crear('movimientos_financieros', {
    ...datos, categoria: categoria || 'general',
    descripcion: sanitizeText(descripcion), origen: 'manual',
  });
}
export function actualizarMovimiento(id, cambios) {
  const movimiento = obtener('movimientos_financieros', id);
  if (!movimiento) throw new Error('Movimiento no encontrado.');
  if (movimiento.origen !== 'manual') {
    throw new Error('Los movimientos automáticos se corrigen editando la labor que los generó.');
  }
  const datos = validarMovimiento({
    finca_id: movimiento.finca_id,
    lote_id: cambios.lote_id === undefined ? movimiento.lote_id : cambios.lote_id,
    tipo: cambios.tipo === undefined ? movimiento.tipo : cambios.tipo,
    monto: cambios.monto === undefined ? movimiento.monto : cambios.monto,
    fecha: cambios.fecha === undefined ? movimiento.fecha : cambios.fecha,
  });
  return actualizar('movimientos_financieros', id, {
    ...datos,
    categoria: cambios.categoria === undefined ? movimiento.categoria : sanitizeText(cambios.categoria) || datos.tipo,
    descripcion: cambios.descripcion === undefined ? movimiento.descripcion : sanitizeText(cambios.descripcion),
  });
}
export function eliminarMovimiento(id) {
  const mov = obtener('movimientos_financieros', id);
  if (mov && mov.origen !== 'manual') {
    throw new Error('Este movimiento se generó automáticamente desde una labor. Elimina la labor para revertirlo.');
  }
  eliminar('movimientos_financieros', id);
}

// -------------------------------------------------------------
// Centro de costos por lote — el cruce que amarra todo el modelo
// -------------------------------------------------------------
const TIPOS_COSTO = ['costo', 'gasto', 'impuesto', 'interes'];

export function calcularCentroCostos(finca_id) {
  const lotes = listarLotes(finca_id);
  const movimientos = listar('movimientos_financieros', (m) => m.finca_id === finca_id);

  const porLote = lotes.map((lote) => {
    const propios = movimientos.filter((m) => m.lote_id === lote.id);
    const ingresos = propios.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
    const costos = propios.filter((m) => TIPOS_COSTO.includes(m.tipo)).reduce((s, m) => s + m.monto, 0);
    return { lote, ingresos, costos, margen: ingresos - costos };
  });

  const generales = movimientos.filter((m) => !m.lote_id);
  const ingresosGenerales = generales.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const costosGenerales = generales.filter((m) => TIPOS_COSTO.includes(m.tipo)).reduce((s, m) => s + m.monto, 0);

  const totales = {
    ingresos: porLote.reduce((s, r) => s + r.ingresos, 0) + ingresosGenerales,
    costos: porLote.reduce((s, r) => s + r.costos, 0) + costosGenerales,
  };
  totales.margen = totales.ingresos - totales.costos;

  return { porLote, generales: { ingresos: ingresosGenerales, costos: costosGenerales }, totales };
}

export function alertasStockBajo(finca_id) {
  return listarInsumos(finca_id).filter((i) => i.stock_actual <= 0);
}
