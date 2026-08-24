-- 032_venues_rls.sql  ·  RALLY
-- RLS de `venues` + columnas de procedencia y de búsqueda de duplicados.
--
-- POR QUÉ AHORA (prerrequisito, no mejora)
--   `venues` es la ÚNICA tabla del esquema que quedó sin RLS: 008_auth_rls.sql
--   no la menciona, así que hoy cualquier usuario autenticado puede insertar,
--   renombrar o BORRAR cualquier sede. Mientras solo el admin sembraba sedes
--   daba igual. En cuanto el organizador pueda darlas de alta desde la app,
--   eso se convierte en un agujero real — y como las sedes se comparten entre
--   organizadores, el daño sería cruzado: borrar una rompe los torneos de otro.
--
-- MODELO: catálogo compartido de SOLO-AÑADIR
--   SELECT → cualquier authenticated   (hay que poder elegir sede)
--   INSERT → cualquier authenticated   (alta en autoservicio)
--   UPDATE → solo admin
--   DELETE → solo admin
--
--   Corregir o borrar una sede afecta a torneos de OTROS organizadores, así que
--   se queda en admin. `created_by` se añade ahora pero NO se usa en las
--   políticas: es caro retrofitearla cuando queramos permitir que el creador
--   edite la suya, y barato tenerla desde el principio.
--
-- Aplicar DESPUÉS de 001_initial_schema.sql y 008_auth_rls.sql.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ----------------------------------------------------------------------------

-- Quién dio de alta la sede. `default auth.uid()` hace que el cliente no tenga
-- que mandarla: se rellena sola y correctamente. `on delete set null` porque
-- borrar al usuario no debe borrar una sede que otros torneos están usando.
alter table public.venues
  add column if not exists created_by uuid
    references auth.users(id) on delete set null
    default auth.uid();

comment on column public.venues.created_by is
  'Quién dio de alta la sede. INFORMATIVO por ahora: las políticas de UPDATE/DELETE '
  'no lo usan (siguen siendo solo-admin). Existe desde el principio para no tener '
  'que retrofitearla cuando se permita al creador editar la suya.';

-- Nombre normalizado para detectar duplicados. Lo escribe el CLIENTE al
-- insertar, con la misma función que alimenta la búsqueda difusa
-- (src/lib/venue-search.ts) — así el criterio es idéntico en ambos lados.
--
-- Deliberadamente NO es una columna generada: la normalización quita palabras
-- genéricas ('club', 'padel', 'canchas'…) y esa lista va a evolucionar. En SQL
-- obligaría a una migración por cada cambio; en el cliente es un array.
--
-- Camino de crecimiento: cuando el volumen lo pida, un índice
--   create index ... using gin (name_normalized extensions.gin_trgm_ops)
-- con pg_trgm convierte esto en búsqueda de servidor sin tocar los datos.
alter table public.venues
  add column if not exists name_normalized text;

comment on column public.venues.name_normalized is
  'Nombre normalizado (minúsculas, sin acentos, sin palabras genéricas) para '
  'sugerir duplicados. Lo escribe el cliente al insertar. Preparado para un '
  'índice GIN con pg_trgm cuando haga falta búsqueda en servidor.';

-- Sin backfill: la tabla está vacía en producción (verificado vía PostgREST,
-- content-range */0). Si algún día se siembran sedes por SQL, hay que rellenar
-- name_normalized a mano o quedarán invisibles para la detección de duplicados.


-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------

alter table public.venues enable row level security;

-- Admin: todo. Mismo patrón que el resto de tablas en 008.
drop policy if exists venues_admin_all on public.venues;
create policy venues_admin_all on public.venues
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Lectura abierta a cualquier autenticado: el catálogo de sedes no es secreto
-- y hay que poder elegir sede al crear un torneo. `anon` NO entra: todas las
-- pantallas que leen venues viven bajo (protected).
drop policy if exists venues_select on public.venues;
create policy venues_select on public.venues
  for select to authenticated
  using (true);

-- Alta en autoservicio. El `with check` NO concede nada extra: solo impide
-- atribuir la sede a otro usuario. Con el default de arriba, un cliente que
-- omita created_by pasa siempre; uno que mande un id ajeno se rechaza.
drop policy if exists venues_insert on public.venues;
create policy venues_insert on public.venues
  for insert to authenticated
  with check (created_by is null or created_by = auth.uid());

-- UPDATE y DELETE: sin política para `authenticated`. Con RLS activa, la
-- ausencia de política permisiva deniega — así que quedan solo para admin,
-- vía venues_admin_all. Es intencional: editar o borrar una sede impacta a
-- torneos de otros organizadores.
