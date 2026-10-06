# AGENTS.md — contexto para agentes de codigo (Antigravity, Cursor, Claude Code, Codex)

Este archivo sigue la convencion AGENTS.md: se lee automaticamente al abrir esta
carpeta como workspace. No hace falta "subirlo" aparte — vive en la raiz del
proyecto junto a index.html.

## Que es esto

Aplicacion de administracion de fincas (nombre de marca aun sin decidir —
candidatos en discusion: Conuco, Sementera). Un agronomo colombiano administra
lotes, labores, inventario, mano de obra y finanzas de su finca desde el
navegador. Sin backend todavia: persiste en localStorage.

## Stack y reglas no negociables

- HTML/CSS/JavaScript plano. Modulos ES nativos (`import`/`export`), **sin
  bundler, sin build step, sin npm install**. Se corre abriendo `index.html`
  o con `python3 -m http.server`.
- Cero dependencias externas en el codigo fuente. Si una funcionalidad nueva
  necesita una libreria, se carga por `<script>` desde un CDN en `index.html`,
  nunca por `npm install`.
- Idioma de toda la interfaz y los comentarios de codigo: **espanol**.
- No usar `localStorage`/`sessionStorage` fuera de `js/store.js` — esa es la
  unica capa que toca persistencia. Las vistas SIEMPRE llaman funciones de
  `store.js`, nunca `localStorage` directamente.

## Estructura

```
index.html            shell de la app, monta las vistas
css/styles.css         sistema de diseno (tokens en :root, claro + oscuro)
js/store.js             capa de datos — unica fuente de verdad, localStorage
js/geo.js               matematica GPS: proyeccion a metros locales, area real
js/canvas.js             editor SVG del diagrama de lotes (viewBox dinamico en metros)
js/format.js             moneda COP, fechas, uid()
js/modal.js              modal y toast reutilizables
js/main.js               enrutamiento por hash entre vistas, barra inferior movil
js/views/*.js            un modulo por pantalla: dashboard, lotes, labores,
                         inventario, personal, finanzas, archivo, avanzado
schema.sql               esquema Postgres/Supabase equivalente, para cuando
                         haya backend real (ver "Proxima fase" abajo)
```

## Convenciones de codigo que hay que seguir

- Cada vista exporta `render(mount, finca)` y es responsable de su propio
  re-render tras una accion (no hay un store global reactivo; cada vista
  llama su propia funcion `pintarX()` despues de mutar datos).
- Entidades nuevas van en `store.js` con el mismo patron: `listarX`, `crearX`,
  `actualizarX`, `eliminarX`, usando los helpers genericos `crear/actualizar/
  eliminar/listar/obtener` ya definidos arriba en el archivo.
- Las coordenadas de lotes se guardan en **metros reales** relativos a
  `finca.origen_gps` (ver `geo.js`), no en pixeles — un punto puede venir de
  un clic manual o de `navigator.geolocation`, y ambos conviven en el mismo
  sistema. No reintroducir coordenadas en pixeles arbitrarios.
- Dinero siempre en COP enteros (sin decimales), formateado con
  `formatCOP()` de `format.js`.
- Modales: usar `abrirModal()`/`mostrarToast()` de `modal.js`, no crear un
  patron de modal nuevo.

## Modulos ya construidos vs. pendientes

Construidos y probados: Lotes (diagrama + GPS), Labores (con mano de obra e
insumos, genera costos automaticos), Inventario, Personal, Finanzas,
Dashboard (centro de costos por lote).

Pendientes, a proposito dejados como placeholder — no expandir sin pedir
contexto primero:
- `js/views/archivo.js` — modulo sin definir aun por el usuario.
- `js/views/avanzado.js` — hoja de ruta del modulo multiespectral (indices
  de vegetacion via Sentinel-2, dron via OpenDroneMap/WebODM). Es trabajo
  real de backend/procesamiento de imagenes, no un CRUD mas.
- Modulo "Datos" (informacion basica de siembra + alertas agroclimaticas)
  del bosquejo original del usuario — no existe todavia, pendiente de elegir
  fuente de datos climaticos.

## Como probar un cambio

No hay framework de testing instalado. El patron usado hasta ahora: un
script Node con `jsdom` que importa los modulos ES directamente y ejercita
`store.js` (CRUD, validaciones de stock, calculo de centro de costos) y el
`render()` de cada vista contra un DOM simulado. Replicar ese patron para
cualquier logica de negocio nueva antes de darla por terminada.

## Proxima fase (no implementar sin que el usuario lo pida)

`schema.sql` ya tiene el modelo relacional equivalente para Supabase/Postgres,
incluida una vista `centro_costos_por_lote`. Migrar `store.js` de localStorage
a llamadas Supabase es el paso siguiente natural, pero cada funcion exportada
de `store.js` deberia mantener su misma firma para no tener que reescribir
las vistas.
