-- ============================================================================
-- 040_public_bracket_read.sql  ·  RALLY
--
-- EL CUADRO ES PÚBLICO
--   En un torneo real el papel está colgado en la pared del club y lo ve quien
--   pase. Además es lo que hace que el link del torneo funcione como canal de
--   adquisición: el organizador lo pega en el grupo de WhatsApp, alguien que no
--   juega lo abre, ve la tabla en vivo y entiende qué es RALLY.
--
--   Hasta hoy, `matches_select` y `gs_select` (migración 013) exigían
--   `is_tournament_participant`. Un jugador NO inscrito no veía nada, y un
--   anónimo menos.
--
-- POR QUÉ SE ABREN LAS TABLAS Y NO SE HACE OTRA VISTA
--   Realtime Postgres Changes solo funciona sobre TABLAS de la publicación,
--   nunca sobre vistas ni RPCs — y Realtime es el punto entero de esta
--   pantalla. Verificado en la 013: la publicación `supabase_realtime` lleva
--   matches, group_standings y match_sets.
--
--   Se puede hacer porque estas cuatro tablas NO tienen ningún dato personal:
--     matches          → ids, stage, status, round_label, court_label, fechas
--     group_standings  → ids + contadores (played/won/lost/sets/games/points)
--     groups           → id, category_id, name ('Grupo A')
--     match_sets       → ids, games_a/b, tiebreak_a/b, set_number
--
--   La identidad va por `bracket_pairs_public` (migración 039), que publica
--   nombre y foto y nada más. `pairs` sigue cerrada: payment_status, seed y
--   schedule_preference no son asunto del cuadro.
--
-- VERIFICADO ANTES DE ESCRIBIR ESTA MIGRACIÓN
--   Se revisó TODA lectura de estas cuatro tablas en el proyecto buscando
--   embeds o joins que aprovecharan estas políticas para traer algo más:
--     · cron-recompute-ratings, match-result, compute-ranking-points y
--       generate-bracket construyen su cliente con SERVICE_ROLE, así que
--       ignoran la RLS por completo. Abrirlas no les cambia nada.
--     · juez/index.tsx        → count(*) con head:true. Sin embed.
--     · PlayerAnalysis.tsx    → select de ids sueltos. Sin embed.
--     · juez/[tournamentId].tsx y los tres componentes de realtime → sus
--       embeds de identidad pasan por `users_select_own`, que NO se toca aquí.
--   No hay ninguna vía por la que abrir estas cuatro tablas exponga algo
--   distinto de lo enumerado arriba.
--
-- Aplicar DESPUÉS de 008, 013 y 039.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. DRIFT DOCUMENTADO: las políticas de `groups` y `match_sets`
--
--    Estas tres políticas EXISTEN en la base pero no están en ninguna
--    migración — se crearon a mano en el editor. Se dejan escritas aquí para
--    que el repositorio deje de mentir sobre el estado real:
--
--      groups     | "groups: owner gestiona"        | ALL    | {public}
--        using: EXISTS (SELECT 1 FROM categories c
--                       JOIN tournaments t ON t.id = c.tournament_id
--                       JOIN organizer_members om ON om.organizer_id = t.organizer_id
--                       WHERE c.id = groups.category_id
--                         AND om.user_id = auth.uid()
--                         AND om.member_role = 'owner')
--
--      groups     | "groups: lectura autenticada"   | SELECT | {public}
--        using: auth.role() = 'authenticated'
--
--      match_sets | "match_sets: lectura autenticada"| SELECT | {public}
--        using: auth.role() = 'authenticated'
--
--    OJO CON EL PATRÓN DE LAS DOS DE LECTURA
--      Su rol declarado es {public} — que en Postgres INCLUYE a `anon` — pero
--      el `using` comprueba `auth.role() = 'authenticated'`. O sea que el
--      filtro real estaba en el USING, no en el TO. Por eso cambiar solo el TO
--      no habría servido de nada: `anon` habría entrado por la puerta y se
--      habría estrellado contra la condición.
--
--      Es también la razón por la que NO había agujero de seguridad pese al
--      {public}: el nombre "lectura autenticada" describía exactamente lo que
--      hacía.
--
--    La de owner NO se toca: gestiona escritura y está bien como está. Solo se
--    documenta.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 1. Helper: category_tournament(uuid)
--
--    `groups` solo tiene category_id, y encadenar tournament_org(...) sobre una
--    subconsulta dentro de la policy la vuelve ilegible. Mismo patrón y mismo
--    search_path que tournament_org/tournament_status de la 008.
--
--    VA PRIMERO A PROPÓSITO: `create policy` analiza su expresión AL CREARLA,
--    no al ejecutarla. Si la función no existe todavía, la policy de `groups`
--    falla con "function public.category_tournament(uuid) does not exist" y la
--    migración se queda a medias.
-- ----------------------------------------------------------------------------

create or replace function public.category_tournament(c_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select tournament_id from public.categories where id = c_id;
$$;

grant execute on function public.category_tournament(uuid) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Los helpers que usan las policies tienen que ser ejecutables por anon
--
--    Sin esto, una policy evaluada para un anónimo revienta con "permission
--    denied for function" en vez de devolver cero filas — y el error sale por
--    PostgREST como 500, no como lista vacía.
-- ----------------------------------------------------------------------------

grant execute on function public.tournament_status(uuid) to anon;
grant execute on function public.tournament_org(uuid)    to anon;
grant execute on function public.is_org_member(uuid)     to anon;
grant execute on function public.is_admin()              to anon;


-- ----------------------------------------------------------------------------
-- 3. bracket_pairs_public → legible sin sesión
-- ----------------------------------------------------------------------------

grant select on public.bracket_pairs_public to anon;


-- ----------------------------------------------------------------------------
-- 4. matches
--
--    Se sustituye la condición de participación por la MISMA que ya usa
--    `categories_select` (008): público si el torneo no es borrador, y los
--    miembros del organizador ven también sus borradores.
--
--    De paso es más barato: la política vieja encadenaba hasta cuatro llamadas
--    a función por fila (participant → judge → owner → admin); esta resuelve el
--    camino común con una.
-- ----------------------------------------------------------------------------

drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
for select to anon, authenticated
using (
  public.tournament_status(tournament_id) <> 'draft'
  or public.is_org_member(public.tournament_org(tournament_id))
  or public.is_admin()
);

comment on policy matches_select on public.matches is
  'El cuadro es publico: cualquiera ve los partidos de un torneo publicado, con '
  'o sin sesion. Los borradores solo los ven los miembros del organizador. '
  'matches no contiene ningun dato personal: la identidad va por '
  'bracket_pairs_public.';

-- La de UPDATE no se toca: escribir sigue siendo juez asignado | owner | admin.


-- ----------------------------------------------------------------------------
-- 5. group_standings
--
--    No tiene tournament_id: hay que llegar por groups → categories.
--    Misma condición que arriba, dentro del EXISTS que ya existía.
-- ----------------------------------------------------------------------------

drop policy if exists gs_select on public.group_standings;
create policy gs_select on public.group_standings
for select to anon, authenticated
using (
  exists (
    select 1
    from public.groups g
    join public.categories c on c.id = g.category_id
    where g.id = group_standings.group_id
      and ( public.tournament_status(c.tournament_id) <> 'draft'
            or public.is_org_member(public.tournament_org(c.tournament_id))
            or public.is_admin() )
  )
);

comment on policy gs_select on public.group_standings is
  'Tabla de grupos publica, misma regla que matches_select. Solo contadores: '
  'sin identidades ni datos de contacto.';

-- Sigue sin policy de escritura para cliente: group_standings lo escribe SOLO
-- service_role desde las RPC.


-- ----------------------------------------------------------------------------
-- 6. groups  (reemplaza la política de drift)
--
--    Se renombra a `groups_select` para que siga la convención del resto del
--    esquema en vez del nombre en español sin versionar.
--
--    El `using` se REESCRIBE por completo: `auth.role() = 'authenticated'`
--    seguiría excluyendo a anon aunque el TO lo permita.
-- ----------------------------------------------------------------------------

drop policy if exists "groups: lectura autenticada" on public.groups;
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
for select to anon, authenticated
using (
  public.tournament_status(public.category_tournament(category_id)) <> 'draft'
  or public.is_org_member(public.tournament_org(public.category_tournament(category_id)))
  or public.is_admin()
);

comment on policy groups_select on public.groups is
  'Nombres de grupo ("Grupo A") de torneos publicados. Reemplaza la politica '
  '"groups: lectura autenticada", creada a mano y nunca versionada, cuyo using '
  'era auth.role() = ''authenticated'' — el TO decia {public} pero el filtro '
  'real vivia en el USING.';


-- ----------------------------------------------------------------------------
-- 7. match_sets  (reemplaza la política de drift)
--
--    Llega al torneo por match_id → matches.
-- ----------------------------------------------------------------------------

drop policy if exists "match_sets: lectura autenticada" on public.match_sets;
drop policy if exists match_sets_select on public.match_sets;
create policy match_sets_select on public.match_sets
for select to anon, authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = match_sets.match_id
      and ( public.tournament_status(m.tournament_id) <> 'draft'
            or public.is_org_member(public.tournament_org(m.tournament_id))
            or public.is_admin() )
  )
);

comment on policy match_sets_select on public.match_sets is
  'Marcadores por set de torneos publicados. Reemplaza la politica '
  '"match_sets: lectura autenticada", creada a mano y nunca versionada.';


-- ============================================================================
-- LO QUE ESTO **NO** DESBLOQUEA TODAVÍA
--
--   Un anónimo ya puede leer el cuadro, pero NO el contexto que lo rodea:
--   `tournaments_select` y `categories_select` (migración 008) siguen siendo
--   `to authenticated`. Verificado con la anon key contra la base real:
--   `tournaments` (2 filas) y `categories` (8 filas) devuelven 200 [] sin
--   sesión.
--
--   Traducido: quien abra el link de WhatsApp sin cuenta verá números y cuadro,
--   pero sin nombre de torneo, sin nombre de categoría y sin sede.
--
--   Abrir esas dos es la pieza que falta, y es una decisión más grande — hace
--   público el catálogo entero de torneos, no solo el cuadro de uno. Queda
--   fuera de esta migración a propósito. Cuando se decida:
--
--     drop policy if exists tournaments_select on public.tournaments;
--     create policy tournaments_select on public.tournaments
--     for select to anon, authenticated
--     using (status::text <> 'draft' or public.is_org_member(organizer_id));
--
--     drop policy if exists categories_select on public.categories;
--     create policy categories_select on public.categories
--     for select to anon, authenticated
--     using (
--       public.tournament_status(tournament_id) <> 'draft'
--       or public.is_org_member(public.tournament_org(tournament_id))
--     );
--
--     grant select on public.venues to anon;   -- para "Cómo llegar"
--
--   OJO: `venues_select` es `using (true)` para authenticated. Abrirla a anon
--   publica el catálogo de sedes entero, no solo la del torneo que se mira.
-- ============================================================================


-- ── Verificación ────────────────────────────────────────────────────────────
-- Con la ANON KEY y sin sesión (curl o el cliente con anon):
--
--   select * from public.matches limit 1;          -- debe devolver filas
--   select * from public.group_standings limit 1;  -- debe devolver filas
--   select * from public.bracket_pairs_public limit 1;
--
-- Y comprobar que lo cerrado sigue cerrado:
--
--   select * from public.pairs limit 1;    -- 0 filas: payment_status a salvo
--   select * from public.users limit 1;    -- 0 filas
--
-- OJO: hoy matches/groups/group_standings/match_sets están VACÍAS (verificado
-- con service_role), así que todo devolverá vacío sin probar nada. La prueba
-- real necesita un torneo con categoría cerrada y cuadro generado.
