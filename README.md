# Finca — administración de sistemas productivos

Aplicación web para administrar una finca: lotes con diagrama, labores con
mano de obra e inventario asociados, y el cruce financiero (ingresos, costos,
gastos, impuestos e intereses) por lote como centro de costos.

## Novedades de esta versión

- **Diagrama a escala real con GPS gratuito**: en "Mapas y lotes", cada punto se
  puede marcar a mano sobre el lienzo o capturar con el botón "Usar mi
  ubicación (GPS)" (API de geolocalización del navegador — gratuita, sin
  llave). Ambos tipos de punto conviven en el mismo sistema de coordenadas
  (metros reales relativos a `finca.origen_gps`), así que el área en
  hectáreas se calcula sola y el diagrama completo de la finca queda
  proporcional de verdad, no es un boceto libre. Ver `js/geo.js`.
- **Personal (M.O.)**: directorio de trabajadores propio, reutilizado como
  lista desplegable al registrar mano de obra en una labor.
- **Navegación tipo app móvil**: barra inferior con las 4 secciones de más
  uso (Panel, Mapas, Labores, Bodega) y un botón "Más" para el resto
  (Gestión Admin, Personal, Archivo, Avanzado). En pantallas grandes se
  conserva el menú lateral completo.
- **Avanzado**: pantalla con la hoja de ruta del módulo multiespectral
  (índices de vegetación, proyección de cosecha, ayuda de fertilización,
  sincronización con dron) — todavía no construido, documentado para la
  siguiente fase.
- **Ficha productiva del lote**: cultivo, variedad, edad, área total y
  productiva, marco de siembra, conteo real/productivo de árboles, altitud,
  suelo, riego y sombra. Si no se informa el conteo real, se estima con el área
  productiva (o área total) y las distancias; esa estimación geométrica no
  descuenta caminos, bordes ni árboles ausentes.
- **Edición de movimientos**: los movimientos financieros manuales se pueden
  editar; los costos automáticos se corrigen editando la labor relacionada.
- **Perfil editable**: desde el menú lateral se pueden corregir el nombre de la
  finca, la ubicación de referencia y el nombre del usuario activo.
- **Producción**: captura editable de cosechas por lote/campaña, gráfico de
  rendimientos observados y una referencia descriptiva basada en el historial
  de cada lote. Las presentaciones se analizan por separado y la referencia
  solo compara registros del mismo cultivo y variedad actuales del lote.
- **Clima georreferenciado**: consulta manual de NASA POWER por coordenadas
  para lluvia, temperatura, humedad y viento; estaciones del IDEAM, Comité de
  Cafeteros u otras redes se pueden agregar e importar por CSV. La grilla NASA
  es reanálisis/modelo, no una medición en el lote ni un pronóstico.
- **Sanidad**: monitoreo por lote de plagas, enfermedades y síntomas; registro
  de diagnóstico, etapa, incidencia, severidad, umbral técnico definido por el
  usuario y acciones. Genera avisos cuando la incidencia alcanza ese umbral o
  una extrapolación simple indica un cruce próximo.
- **Tableros de finca**: el Panel reúne vistas navegables de resumen,
  producción, sanidad, clima y gestión, con indicadores y enlaces directos a
  las acciones de cada módulo. Sanidad permite filtrar el historial por lote,
  tipo, fecha y organismo.
- **Contexto clima–sanidad**: compara la incidencia cuantificada con lluvia,
  humedad y temperatura de los siete días previos, usando la fuente climática
  más cercana con datos. Muestra cobertura, tamaño de muestra, fuente y
  correlación exploratoria; no supone causalidad ni ofrece una predicción
  biológica o tratamiento.
- **Tema y gráficas**: interfaz clara predeterminada, gráficas de lluvia y
  temperatura por separado, e historial de rendimientos e incidencia.
- **Marca Orden Agro**: logotipo e isotipo vectoriales actualizados para
  reproducir la composición de la identidad compartida: brote, crecimiento,
  barras productivas y nombre con el lema “Gestión Inteligente del Campo”.

## Cómo correrla

No requiere instalación ni build. Es HTML/CSS/JavaScript plano (módulos ES,
sin framework ni bundler):

```bash
cd finca-app
python3 -m http.server 8000
# abrir http://localhost:8000
```

(Abrir `index.html` directamente con doble clic también funciona en la
mayoría de navegadores; usar un servidor local evita restricciones de CORS
en algunos navegadores con módulos ES.)

Los datos se guardan en `localStorage` del navegador — persisten entre
sesiones en ese mismo computador/navegador, pero no se sincronizan entre
dispositivos todavía. La autenticación sigue siendo una simulación local:
aunque las contraseñas nuevas se almacenan como hashes, esto **no sustituye**
una autenticación segura en servidor y no debe usarse con datos sensibles ni
como sistema multiusuario. El botón **"Exportar datos (.json)"** en el panel
lateral sirve como respaldo manual mientras no haya un backend.

La capa de datos valida cantidades, montos, fechas y relaciones con la finca.
El registro de una labor (consumos, descuentos de stock y costos automáticos)
se guarda como una sola operación: si falla la persistencia, se revierte el
cambio en memoria y se informa el error, en lugar de dejar registros parciales.
Las labores nuevas quedan pendientes por defecto: el inventario y los costos
solo se contabilizan al marcarlas como completadas. Si se devuelve una labor
completada a un estado anterior, se revierte el descuento y sus costos; las
cantidades y precios previstos se conservan para volver a completarla. Los
registros creados con versiones anteriores conservan los movimientos que ya
se habían contabilizado; no se reescribe ese historial automáticamente.

## Producción y datos climáticos

La referencia productiva calcula kg/ha de cada campaña comparable. Con una o
dos campañas usa la mediana; con tres o más usa un modelo de tendencia
ponderada de hasta cinco campañas recientes y amortigua la pendiente lineal.
La proyección se multiplica por el área productiva actual (o el área total si
falta el dato). El estimado de tendencia se limita al rango observado en las
últimas cinco campañas para evitar extrapolar rendimientos extremos. El
backtest muestra el error porcentual absoluto medio de las comparaciones
históricas que fue posible hacer, junto al tamaño de muestra. Presentaciones,
cultivo y variedad se mantienen separados. El mínimo/máximo de las últimas
cinco campañas es un rango de escenarios observados, no un intervalo de
confianza. El método es una línea base exploratoria, no ha sido calibrado ni
validado para una zona cafetera y no incorpora clima, edad, floración, carga
de frutos, manejo ni alternancia productiva.

Para usar el modelo en decisiones se debe registrar el resultado real de cada
cosecha y evaluar sus estimaciones en varias campañas. Para un modelo que
ajuste clima, fenología, edad, variedad y manejo, la finca deberá reunir esas
variables por campaña y se deberá validar con datos locales antes de añadir
coeficientes: la app no infiere efectos agronómicos no medidos.

El botón **Consultar y guardar datos** consulta la NASA POWER Daily API solo al
ser pulsado; envía coordenadas y fechas, no el nombre de la finca. Se guardan
precipitación diaria corregida, temperatura mínima/máxima, humedad relativa y
viento. La fuente meteorológica es una grilla de reanálisis/modelo (MERRA-2 y
fuentes POWER; resolución nativa aproximada de 0,5° × 0,625°), con datos
históricos y cercanos a tiempo real; **no es una estación en el lote ni una
predicción futura**. Los valores faltantes se conservan vacíos. Se atribuye a
[NASA POWER](https://power.larc.nasa.gov/) y se incluye su
[documentación meteorológica](https://power.larc.nasa.gov/docs/methodology/meteorology/).
Las series de estaciones del IDEAM, Comité de Cafeteros u otra red se registran
por separado con su proveedor y se pueden importar en CSV con los encabezados
`fecha,lluvia_mm,temp_min_c,temp_max_c,humedad_pct,viento_ms`.

El módulo de sanidad conserva observaciones y diagnósticos por lote. No
precarga umbrales que podrían no aplicar al método de muestreo, zona o fase del
cultivo; el usuario solo debe configurar uno respaldado por asistencia técnica
local. Una alerta recomienda repetir el muestreo y confirmar el diagnóstico,
no aplicar un plaguicida. La tendencia de incidencia requiere tres o más
observaciones cuantificadas y es una extrapolación descriptiva; no es un
pronóstico biológico.

El panel de asociación clima–sanidad empareja cada monitoreo con los siete días
previos y exige al menos cinco días con dato para calcular cada variable. La
correlación solo se muestra con al menos cinco pares; la señal de vigilancia
exploratoria exige al menos ocho pares, asociación positiva y una exposición
climática reciente por encima del cuartil 75 de las ventanas históricas
disponibles. Se presenta únicamente como motivo para priorizar un nuevo
muestreo. La estación más cercana puede no representar el microclima del lote,
y correlación no implica causalidad. Con pocos datos, datos faltantes o fuentes
distantes la interpretación es especialmente limitada; verifica los registros
y consulta asistencia técnica local.

Estas decisiones siguen recomendaciones de literatura: caracterizar cultivar,
edad, unidad productiva, área/árboles, historial por campaña, fenología,
manejo, clima y suelo; comparar contra referencias sencillas y validar en
ciclos posteriores antes de declarar precisión. La evidencia revisada no
permite transferir un coeficiente universal a todas las fincas cafeteras.

Referencias científicas:

- García L. JC, Posada-Suárez H, Läderach P. (2014). *Recommendations for the
  Regionalizing of Coffee Cultivation in Colombia: A Methodological Proposal
  Based on Agro-Climatic Indices*. PLOS ONE 9(12): e113510.
  [https://doi.org/10.1371/journal.pone.0113510](https://doi.org/10.1371/journal.pone.0113510)
- Torgbor BA et al. (2023). *Integrating Remote Sensing and Weather Variables
  for Mango Yield Prediction Using a Machine Learning Approach*. Remote Sensing
  15(12): 3075. [https://doi.org/10.3390/rs15123075](https://doi.org/10.3390/rs15123075)
- van Klompenburg T, Kassahun A, Catal C. (2020). *Crop yield prediction using
  machine learning: A systematic literature review*. Computers and Electronics
  in Agriculture 177: 105709.
  [https://doi.org/10.1016/j.compag.2020.105709](https://doi.org/10.1016/j.compag.2020.105709)
- Läderach P et al. (2017). *Climate change adaptation of coffee production in
  space and time*. Climatic Change 141: 47–62.
  [https://doi.org/10.1007/s10584-016-1788-9](https://doi.org/10.1007/s10584-016-1788-9)

## Plan de evolución del panel

1. **Base de datos y experiencia de edición**: ficha de lote productiva,
   edición de cosechas, finanzas y labores, con validaciones y trazabilidad.
2. **Producción**: recopilar campañas históricas en unidad comparable,
   visualizar variabilidad observada y mejorar gradualmente la estimación con
   fenología, edad, manejo y validación local; no publicar métricas de precisión
   sin evaluación.
3. **Clima y sanidad**: contrastar NASA POWER y las redes de estación con datos
   locales; afinar umbrales y recomendaciones con asistencia técnica
   cafeteras regionales antes de automatizar decisiones de control.
4. **Resumen por finca y lote**: consolidar labores, alertas, costos, referencias
   de producción y observaciones climáticas sin mezclar unidades ni ocultar
   datos faltantes.
5. **Validación de campo**: medir error de proyección y revisar datos, términos,
   umbrales, alertas y utilidad con el agrónomo antes de usar la aplicación para
   decisiones productivas.

## Estructura

```
finca-app/
├── index.html            Shell de la app y montaje de vistas
├── css/styles.css        Sistema de diseño (tokens, componentes)
├── js/
│   ├── main.js            Enrutamiento entre vistas y arranque
│   ├── store.js           Capa de datos + lógica de negocio (el corazón del modelo)
│   ├── canvas.js           Editor SVG del diagrama de lotes
│   ├── modal.js            Modal y notificaciones reutilizables
│   ├── format.js           Moneda COP, fechas, IDs
│   └── views/              un módulo por pantalla: resumen, lotes,
│                            producción, clima, labores, inventario, finanzas
└── schema.sql             Modelo relacional equivalente en Postgres/Supabase
```

`store.js` es la única capa que toca `localStorage`. Ninguna vista accede a
los datos directamente — todas llaman funciones de `store.js`. Esto es lo
que permite reemplazar `store.js` por llamadas a Supabase más adelante sin
tocar una sola vista.

## El modelo de datos (por qué está armado así)

Todo cuelga de `lote_id`:

- Una **labor** se asigna a un lote, y puede llevar **mano de obra**
  (jornales × valor) e **insumos/herramientas** consumidos.
- Al guardar una labor, la app descuenta el stock del insumo automáticamente
  y genera los **movimientos financieros** de costo correspondientes, ya
  amarrados a ese lote.
- El **panel general** simplemente suma, por lote, los movimientos de tipo
  `ingreso` contra los de `costo/gasto/impuesto/interes`. No hay un módulo
  de "centro de costos" separado: es una consulta sobre los mismos datos.

Por eso no hace falta tener todos los lotes definidos de antemano: cada
usuario dibuja los suyos en "Lotes y diagrama" y desde ahí todo lo demás
(labores, inventario, finanzas) ya sabe cómo relacionarse con ellos.

## Ruta de evolución hacia un backend real

1. **Ahora**: una finca por navegador, datos en `localStorage`. Sirve para
   validar el flujo completo con datos reales de una operación.
2. **Siguiente paso**: crear un proyecto en Supabase, correr `schema.sql`
   (incluye una vista `centro_costos_por_lote` equivalente a la del
   dashboard), y reemplazar las funciones de `store.js` por llamadas al
   cliente de Supabase (`@supabase/supabase-js`) — la firma de cada función
   exportada puede quedarse igual, solo cambia su implementación interna.
3. **Multi-finca / multi-usuario**: `schema.sql` ya incluye `usuario_id` en
   `fincas` y políticas de Row Level Security comentadas, listas para
   activar cuando haya autenticación real (Supabase Auth).
4. **Diagrama georreferenciado**: si más adelante se necesita trazabilidad
   real (coordenadas GPS, por ejemplo para certificación de exportación),
   `canvas.js` es el único módulo que habría que sustituir por un mapa
   (Leaflet/Mapbox) — el resto de la app solo referencia `lote.id`.

## Siguiente paso sugerido

Abrir esta carpeta en VS Code con la extensión de Claude Code y pedirle,
módulo por módulo, las funcionalidades que falten (por ejemplo: reportes por
rango de fechas, múltiples fincas, o la migración a Supabase del punto 2).
# Orden-Agro
