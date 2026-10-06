# Hoja de Ruta Arquitectónica: Orden Agro SaaS

## 1. Seguridad, Autenticación y Multi-usuario (Backend)
Como el navegador no puede ocultar secretos ni proteger bases de datos directamente, integraremos **Supabase** (PostgreSQL) usando su CDN nativo (sin `npm`).
*   **Protección contra Inyección SQL:** Supabase utiliza consultas preparadas (Prepared Statements) en su API REST (PostgREST). Es matemáticamente imposible hacer una inyección SQL.
*   **Protección de Datos Personales (RLS):** Activaremos *Row Level Security* en tu base de datos. Esto significa que a nivel del motor de base de datos, el Usuario A jamás podrá leer los lotes, finanzas o empleados del Usuario B, incluso si intenta hackear la API.
*   **Código Oculto:** Los cálculos financieros pesados y el modelo agroclimático vivirán como Funciones de Postgres o Edge Functions en el servidor. El usuario solo verá el resultado visual.

## 2. Gestión Administrativa y Centro de Costos (ABC)
El modelo que planteas se llama **Costeo Basado en Actividades (ABC por sus siglas en inglés)**.
*   **Cronograma de Labores:** Crearemos una vista de calendario/Gantt. Al planear una labor (ej. "Fertilización"), se reserva el stock en bodega y se pre-calcula el costo del personal.
*   **Costos por Lote:** Al marcar la labor como "Completada", el sistema descarga automáticamente el inventario (insumos usados) y genera el movimiento financiero negativo (Gasto) amarrado específicamente al ID de ese Lote.
*   **Estado de Resultados (P&L):** Un panel global que consolida todos los lotes y agrega los gastos generales de la finca (impuestos, servicios, administración) entregando indicadores: Ingresos Brutos, EBITDA (Utilidad Operativa) y Margen Neto.

## 3. Proyección de Cosecha e Inteligencia Agroclimática
Para evitar alucinaciones, no usaremos "IA generativa" para adivinar el clima o la cosecha, sino **modelos científicos basados en datos**:
*   **API Climática:** Conectaremos la app a **Open-Meteo** (o NASA POWER), que provee datos meteorológicos históricos y pronósticos gratuitos por coordenadas GPS exactas (que ya guardamos en los lotes).
*   **Modelo de Proyección:** Usaremos la metodología **FAO-56** (Coeficientes de Cultivo - $K_c$) y **Grados Día de Desarrollo (GDD)**. 
    *   *Ejemplo:* Si el lote tiene Maíz, el sistema suma la temperatura diaria promedio por encima de 10°C. Al alcanzar ~1200 GDD históricos sumados, el sistema predice que la cosecha está lista, cruzando esto con la cantidad de fertilizante aplicado para estimar el volumen (Rendimiento esperado).

## 4. Políticas de Privacidad
Añadiremos un modal inicial o vista de "Términos y Condiciones" exigiendo el consentimiento de tratamiento de datos (Cumplimiento de Ley de Protección de Datos Personales / Habeas Data).
