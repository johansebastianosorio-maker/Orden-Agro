-- =============================================================
-- schema.sql — modelo de datos para Postgres / Supabase.
--
-- Es el equivalente relacional exacto de lo que hoy vive en
-- localStorage (js/store.js). Cuando decidan mover la app a un
-- backend real, este esquema es el punto de partida: las mismas
-- entidades, las mismas relaciones por id, y la misma consulta
-- de centro de costos por lote, resuelta aquí como una vista SQL
-- en vez de una función en JavaScript.
--
-- Pensado para multi-finca desde el inicio (usuario_id en
-- fincas), aunque la app hoy solo usa una finca activa por
-- usuario. Las políticas de Row Level Security quedan comentadas
-- al final, listas para activar cuando haya autenticación real.
-- =============================================================

create extension if not exists "pgcrypto";

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text unique,
  created_at timestamptz not null default now()
);

create table fincas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  nombre text not null,
  ubicacion text,
  origen_gps jsonb,            -- {lat,lng} — primer punto GPS capturado; ancla el diagrama a coordenadas reales
  created_at timestamptz not null default now()
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  nombre text not null,
  cultivo text,
  variedad text,
  edad_anios numeric(6,2),
  area_ha numeric(10,2) not null default 0,
  area_productiva_ha numeric(10,2),
  distancia_surcos_m numeric(8,2),
  distancia_plantas_m numeric(8,2),
  arboles_actuales integer,
  arboles_productivos integer,
  altitud_m numeric(8,2),
  tipo_suelo text,
  riego text not null default 'desconocido' check (riego in ('si','no','desconocido')),
  sombra text not null default 'desconocido' check (sombra in ('pleno_sol','sombra','mixto','desconocido')),
  color text,
  poligono jsonb,               -- [{x,y,lat,lng}, ...] — x,y en metros reales relativos a fincas.origen_gps; lat,lng cuando ese punto se capturó por GPS
  created_at timestamptz not null default now()
);

create table insumos (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  nombre text not null,
  categoria text,
  unidad text not null,
  stock_actual numeric(12,2) not null default 0,
  costo_unitario numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table herramientas (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  nombre text not null,
  categoria text,
  cantidad_disponible integer not null default 0,
  costo_uso_unitario numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table personal (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  nombre text not null,
  rol text,
  contacto text,
  jornal_habitual numeric(14,2) not null default 0,
  disponible boolean not null default true,
  created_at timestamptz not null default now()
);

create table labores (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  lote_id uuid references lotes(id) on delete set null,
  nombre text not null,
  tipo text not null,
  fecha date not null default current_date,
  estado text not null default 'pendiente' check (estado in ('pendiente','en curso','completada')),
  descripcion text,
  created_at timestamptz not null default now()
);

create table mano_obra (
  id uuid primary key default gen_random_uuid(),
  labor_id uuid not null references labores(id) on delete cascade,
  personal_id uuid references personal(id) on delete set null,
  trabajador text,
  jornales numeric(6,2) not null default 0,
  valor_jornal numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table consumos_labor (
  id uuid primary key default gen_random_uuid(),
  labor_id uuid not null references labores(id) on delete cascade,
  item_tipo text not null check (item_tipo in ('insumo','herramienta')),
  item_id uuid not null,
  item_nombre text not null,
  cantidad numeric(12,2) not null check (cantidad > 0),
  unidad text,
  costo_unitario numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table cosechas (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  cultivo text not null,
  variedad text,
  campania integer not null,
  produccion_kg numeric(14,2) not null check (produccion_kg > 0),
  unidad_producto text not null check (unidad_producto in ('kg_pergamino_seco','kg_cereza','kg_otro')),
  area_cosechada_ha numeric(10,2) not null check (area_cosechada_ha > 0),
  observaciones text,
  unique (lote_id, campania, cultivo, variedad, unidad_producto),
  created_at timestamptz not null default now()
);

create table estaciones_clima (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  proveedor text not null default 'IDEAM',
  lat numeric(9,6) not null check (lat between -90 and 90),
  lng numeric(9,6) not null check (lng between -180 and 180),
  altitud_m numeric(8,2),
  created_at timestamptz not null default now(),
  unique (finca_id, codigo)
);

create table observaciones_clima (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  estacion_id uuid not null references estaciones_clima(id) on delete cascade,
  fecha date not null,
  lluvia_mm numeric(8,2) check (lluvia_mm >= 0),
  temp_min_c numeric(5,2),
  temp_max_c numeric(5,2),
  humedad_pct numeric(5,2) check (humedad_pct between 0 and 100),
  viento_ms numeric(6,2) check (viento_ms >= 0),
  proveedor text not null default 'IDEAM',
  importada boolean not null default true,
  created_at timestamptz not null default now(),
  check (temp_min_c is null or temp_max_c is null or temp_min_c <= temp_max_c),
  check (lluvia_mm is not null or temp_min_c is not null or temp_max_c is not null or humedad_pct is not null or viento_ms is not null),
  unique (estacion_id, fecha)
);

create table registros_fitosanitarios (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  fecha date not null,
  agente text not null,
  tipo text not null check (tipo in ('plaga','enfermedad','síntoma','otro')),
  diagnostico text not null check (diagnostico in ('por_confirmar','confirmado','descartado')),
  severidad text not null default 'sin_dato' check (severidad in ('sin_dato','leve','moderada','alta')),
  incidencia_pct numeric(5,2) check (incidencia_pct between 0 and 100),
  umbral_control_pct numeric(5,2) check (umbral_control_pct between 0 and 100),
  etapa_cultivo text,
  observaciones text,
  acciones text,
  created_at timestamptz not null default now()
);

create table movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  labor_id uuid not null references labores(id) on delete cascade,
  item_tipo text not null check (item_tipo in ('insumo','herramienta')),
  item_id uuid not null,
  item_nombre text not null,
  cantidad numeric(12,2) not null,
  unidad text,
  costo_unitario numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table movimientos_financieros (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  lote_id uuid references lotes(id) on delete set null,
  tipo text not null check (tipo in ('ingreso','costo','gasto','impuesto','interes')),
  categoria text,
  descripcion text,
  monto numeric(14,2) not null,
  fecha date not null default current_date,
  origen text not null default 'manual' check (origen in ('manual','auto_labor','auto_insumo')),
  ref_labor_id uuid references labores(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on lotes (finca_id);
create index on insumos (finca_id);
create index on herramientas (finca_id);
create index on personal (finca_id);
create index on labores (finca_id, lote_id);
create index on cosechas (finca_id, lote_id, campania);
create index on observaciones_clima (finca_id, estacion_id, fecha);
create index on registros_fitosanitarios (finca_id, lote_id, agente, fecha);
create index on movimientos_financieros (finca_id, lote_id);
create index on movimientos_financieros (ref_labor_id);

-- -------------------------------------------------------------
-- Vista: centro de costos por lote
-- Mismo cálculo que store.calcularCentroCostos() en el frontend,
-- resuelto en SQL para reportes o para cuando el dashboard
-- consulte directamente la base de datos.
-- -------------------------------------------------------------
create or replace view centro_costos_por_lote as
select
  l.id as lote_id,
  l.finca_id,
  l.nombre as lote_nombre,
  coalesce(sum(m.monto) filter (where m.tipo = 'ingreso'), 0) as ingresos,
  coalesce(sum(m.monto) filter (where m.tipo in ('costo','gasto','impuesto','interes')), 0) as costos,
  coalesce(sum(m.monto) filter (where m.tipo = 'ingreso'), 0)
    - coalesce(sum(m.monto) filter (where m.tipo in ('costo','gasto','impuesto','interes')), 0) as margen
from lotes l
left join movimientos_financieros m on m.lote_id = l.id
group by l.id, l.finca_id, l.nombre;

-- -------------------------------------------------------------
-- Row Level Security — activar cuando haya autenticación real
-- (Supabase Auth) y la app deje de ser de una sola finca local.
-- Cada tabla quedaría filtrada por finca_id perteneciente al
-- usuario autenticado (auth.uid()).
-- -------------------------------------------------------------
-- alter table fincas enable row level security;
-- create policy "usuario ve sus propias fincas" on fincas
--   for all using (usuario_id = auth.uid());
--
-- alter table lotes enable row level security;
-- create policy "usuario ve lotes de sus fincas" on lotes
--   for all using (finca_id in (select id from fincas where usuario_id = auth.uid()));
-- (repetir el mismo patrón para insumos, herramientas, labores,
--  mano_obra, movimientos_inventario y movimientos_financieros)
