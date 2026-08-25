-- ============================================================================
-- 038_tournament_category_counts.sql  ·  RALLY
--
-- EL PROBLEMA
--   La pantalla de detalle de torneo esconde las categorías hasta que el
--   organizador cierra inscripciones. Eso es al revés: le pide al jugador que
--   se inscriba sin saber a qué categorías puede entrar. Lo que debe esconderse
--   hasta el cierre es el CUADRO, no la lista.
--
--   Las categorías en sí ya son legibles: `categories_select` (migración 008)
--   deja verlas a cualquier autenticado mientras el torneo no sea draft.
--
--   Lo que NO se puede leer es cuántas parejas van. `pairs_select` es:
--       player1_id = auth.uid() or player2_id = auth.uid()
--       or is_org_member(tournament_org(tournament_id))
--   Un jugador que todavía no se inscribió no cumple ninguna, así que un
--   count(*) desde el cliente le devuelve 0 en TODAS las categorías — no un
--   error, un cero. Peor que no enseñar nada: enseñaría un dato falso.
--
-- LA SOLUCIÓN
--   Un RPC SECURITY DEFINER que devuelve SOLO el agregado. Nunca ids de
--   parejas, nunca nombres. Saber que en la 5ª Mixta van seis parejas no dice
--   quiénes son, y es justo el dato que el jugador necesita para decidir.
--
--   NO se relaja `pairs_select`. Abrirla para permitir el conteo expondría las
--   filas enteras, que es exactamente lo que no queremos.
--
-- Aplicar DESPUÉS de 008 y 011.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- QUÉ SE CUENTA
--   Solo las parejas que cuentan para el cuadro: paid_online, paid_offline y
--   comp. Mismo criterio que close-registration y que la pantalla de cierre
--   del organizador.
--
--   Las 'pending' quedan fuera a propósito. Una pareja que empezó el pago y no
--   lo terminó no está inscrita, y contarla le prometería al jugador una
--   categoría más llena de lo que está. Si además abandona, el número baja
--   solo y parece un error.
--
-- POR QUÉ LLEVA GUARD DE VISIBILIDAD
--   SECURITY DEFINER ignora la RLS, así que hay que reimplementar a mano lo que
--   `categories_select` ya decide: un torneo en draft solo lo ven los miembros
--   de su organizador. Sin esto, cualquiera podría sondear la actividad de
--   torneos que ni siquiera están publicados.
-- ----------------------------------------------------------------------------

create or replace function public.tournament_category_counts(p_tournament_id uuid)
returns table(
  category_id uuid,
  pair_count  int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Espejo exacto de categories_select (migración 008). Si aquella cambia,
  -- esta tiene que cambiar con ella.
  if not (
    public.tournament_status(p_tournament_id) <> 'draft'
    or public.is_org_member(public.tournament_org(p_tournament_id))
  ) then
    -- Vacío, no excepción: para quien no debe verlo, un torneo en draft es
    -- indistinguible de uno sin categorías. Un error revelaría que existe.
    return;
  end if;

  return query
    select
      c.id,
      count(p.id)::int
    from public.categories c
    left join public.pairs p
      on p.category_id = c.id
     and p.payment_status in ('paid_online', 'paid_offline', 'comp')
    where c.tournament_id = p_tournament_id
    group by c.id;
end;
$$;

comment on function public.tournament_category_counts(uuid) is
  'Parejas confirmadas por categoría de un torneo. SECURITY DEFINER porque '
  'pairs_select solo deja ver las propias: un jugador no inscrito contaría 0 '
  'en todas. Devuelve SOLO el agregado, nunca identidades. Cuenta '
  'paid_online/paid_offline/comp, igual que close-registration.';

revoke all     on function public.tournament_category_counts(uuid) from public, anon;
grant  execute on function public.tournament_category_counts(uuid) to authenticated;


-- ── Verificación ────────────────────────────────────────────────────────────
-- Con un JWT de jugador NO inscrito (no con service_role, que ignora la RLS):
--
--   -- 1. Las categorías SÍ se leen hoy. Debe devolver filas.
--   select id, display_name, status from public.categories
--    where tournament_id = '<id-de-torneo-no-draft>';
--
--   -- 2. Las parejas NO. Debe devolver 0 aunque haya parejas de verdad.
--   select count(*) from public.pairs
--    where tournament_id = '<id-de-torneo-no-draft>';
--
--   -- 3. El RPC sí devuelve el conteo real.
--   select * from public.tournament_category_counts('<id-de-torneo-no-draft>');
--
-- Si (2) devuelve algo distinto de 0, la RLS de pairs no es la que dice la 008
-- y hay drift que revisar antes de confiar en esta función.
