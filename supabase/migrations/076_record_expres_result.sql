-- 076_record_expres_result.sql  ·  RALLY
--
-- CAPTURAR UN SUMA 6. CAMINO PARALELO, NO UNA RAMA.
--
--   `record_match_result` (048, 062) escribe `winner_pair_id` siempre y valida
--   un marcador de sets. Un suma 6 no tiene ganador y un 5-1 no es un set. No
--   se le añade un `if p_expres` a esa función: lleva un torneo real de 165
--   parejas encima y cada rama nueva se juega ese historial.
--
--   Esta es su gemela para exprés. Copia deliberadamente tres cosas de ella,
--   porque son las que costaron sangre y no hay que reinventarlas:
--
--     1. AUTORIZACIÓN EXPLÍCITA contra p_actor. Vía service_role auth.uid() es
--        NULL, así que can_capture_tournament() no sirve aquí.
--     2. BLOQUEO DEL GRUPO ENTERO en orden de id, para que dos capturas
--        cruzadas del mismo grupo se serialicen en vez de pisarse.
--     3. COMPROBACIÓN DE ESTADO: si el grupo cambió entre que la app calculó
--        la tabla y que llegó aquí, se rechaza con 'group_changed' y la app
--        recalcula. Sin esto, dos jueces capturando a la vez dejan la tabla
--        con los números de uno y los puestos del otro.
--
--   Y cambia dos:
--
--     · NO RECIBE GANADOR. No es que lo omita: no existe. Escribe
--       winner_pair_id = null siempre, y el constraint de la 075 lo exige.
--     · EL ESTADO DEL GRUPO SE COMPARA POR MARCADOR, no por ganador. En un
--       exprés todos los winner_pair_id son null, así que compararlos no
--       detectaría ningún cambio: dos capturas simultáneas pasarían las dos.
--       Se comparan los games, que es lo que de verdad mueve la tabla.
--
-- BORRAR UN MARCADOR
--   p_games_a y p_games_b en null devuelven el partido a 'scheduled' y le
--   quitan el marcador. Es la corrección de "capturé el partido equivocado".

begin;

drop function if exists public.record_expres_result(uuid,uuid,timestamptz,int,int,jsonb,jsonb);

create or replace function public.record_expres_result(
  p_actor       uuid,        -- auth.uid() del que captura (re-verificado aquí)
  p_match_id    uuid,
  p_played_at   timestamptz,
  p_games_a     int,         -- null los DOS = borrar el marcador
  p_games_b     int,
  p_standings   jsonb,       -- [{pair_id, played, games_won, games_lost, position, clinch_status}, ...]
  p_group_state jsonb        -- [{match_id, status, games_a, games_b}, ...] tal como lo leyó la app
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_group      uuid;
  v_modo       public.tournament_modo;
  v_formato    public.formato_partido;
  v_era        public.match_status;
  v_actual     jsonb;
  v_filas      int;
  v_esperadas  int;
  s            jsonb;
  v_borrando   boolean := (p_games_a is null and p_games_b is null);
begin
  -- ── Contexto ──────────────────────────────────────────────────────────────
  select m.tournament_id, m.group_id, m.formato, m.status
    into v_tournament, v_group, v_formato, v_era
    from public.matches m where m.id = p_match_id;

  if not found then raise exception 'match_not_found'; end if;
  if v_group is null then raise exception 'not_a_group_match'; end if;

  select t.modo into v_modo from public.tournaments t where t.id = v_tournament;
  if v_modo is distinct from 'expres' then
    raise exception 'not_an_expres_tournament'
      using hint = 'Este partido es de un torneo largo: usa record_match_result.';
  end if;
  if v_formato is distinct from 'suma_6' then
    raise exception 'not_a_suma6_match'
      using hint = 'Solo la fase de grupos de un exprés se captura por aquí.';
  end if;

  -- ── Autorización explícita (patrón 011: p_actor, no auth.uid()) ──────────
  if not (
    exists (select 1 from public.users u
              where u.id = p_actor and u.role = 'admin')
    or exists (select 1 from public.organizer_members om
              where om.organizer_id = public.tournament_org(v_tournament)
                and om.user_id = p_actor and om.member_role = 'owner')
    or exists (select 1 from public.tournament_judges tj
              where tj.tournament_id = v_tournament and tj.user_id = p_actor)
  ) then
    raise exception 'not_authorized';
  end if;

  -- ── El marcador, validado aquí también ───────────────────────────────────
  --
  --   El trigger de la 075 ya lo comprueba al insertar, y el motor antes de
  --   llegar. Se repite porque un error de contrato tiene que salir con nombre
  --   ('suma6_marcador_invalido') y no como la violación de un trigger tres
  --   capas más abajo.
  if not v_borrando then
    if p_games_a is null or p_games_b is null then
      raise exception 'suma6_medio_marcador'
        using hint = 'Un suma 6 se captura entero: o los dos números o ninguno.';
    end if;
    if p_games_a < 0 or p_games_b < 0 or p_games_a + p_games_b <> 6 then
      raise exception 'suma6_marcador_invalido'
        using hint = format('%s-%s suma %s. Solo existen 6-0, 5-1, 4-2, 3-3, 2-4, 1-5 y 0-6.',
                            p_games_a, p_games_b, p_games_a + p_games_b);
    end if;
  end if;

  -- ── Bloqueo del grupo entero, en orden de id ─────────────────────────────
  perform 1 from public.matches
   where group_id = v_group
   order by id
     for update;

  -- ── ¿Sigue el grupo como lo vio quien calculó la tabla? ──────────────────
  --
  --   Por MARCADOR, no por ganador: en un exprés todos los ganadores son null
  --   y comparar nulls no detecta nada.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'match_id', m.id,
               'status',   m.status::text,
               'games_a',  ms.games_a,
               'games_b',  ms.games_b
             ) order by m.id
           ),
           '[]'::jsonb
         )
    into v_actual
  from public.matches m
  left join public.match_sets ms
         on ms.match_id = m.id and ms.set_number = 1
  where m.group_id = v_group;

  if p_group_state is null or v_actual <> p_group_state then
    raise exception 'group_changed'
      using hint = 'Alguien capturó otro partido de este grupo mientras tanto. Vuelve a cargar y repite.';
  end if;

  -- ── El marcador se regraba entero (permite corregir) ─────────────────────
  delete from public.match_sets where match_id = p_match_id;

  if not v_borrando then
    insert into public.match_sets (match_id, set_number, games_a, games_b, is_super_tiebreak)
    values (p_match_id, 1, p_games_a, p_games_b, false);
  end if;

  -- ── El partido ───────────────────────────────────────────────────────────
  --
  --   winner_pair_id = null SIEMPRE. Lo que dice que el partido acabó es
  --   `status`, no el ganador — ver la cabecera de la migración 075.
  if v_borrando then
    update public.matches
       set winner_pair_id = null,
           status         = 'scheduled',
           played_at      = null
     where id = p_match_id;
  else
    update public.matches
       set winner_pair_id = null,
           status         = 'finished',
           played_at      = coalesce(p_played_at, now())
     where id = p_match_id;
  end if;

  -- ── La tabla del grupo entero ────────────────────────────────────────────
  --
  --   Se regraban TODAS las filas: el saldo de una pareja mueve el puesto de
  --   las demás. Y se cuenta lo actualizado — si llegan filas que no existen
  --   en group_standings, el UPDATE no daría error y la tabla se quedaría a
  --   medias, que es peor que no escribir nada.
  --
  --   won, lost, sets_won, sets_lost y points van a 0 a propósito: en un
  --   exprés no significan nada, y dejar el valor de una captura anterior lo
  --   convertiría en un dato creíble. `balance` NO se escribe: es columna
  --   generada (075).
  v_filas := 0;
  for s in select * from jsonb_array_elements(p_standings) loop
    update public.group_standings
       set played        = (s->>'played')::int,
           games_won     = (s->>'games_won')::int,
           games_lost    = (s->>'games_lost')::int,
           position      = (s->>'position')::int,
           clinch_status = (s->>'clinch_status')::public.clinch_status,
           won           = 0,
           lost          = 0,
           sets_won      = 0,
           sets_lost     = 0,
           points        = 0,
           updated_at    = now()
     where group_id = v_group
       and pair_id  = (s->>'pair_id')::uuid;
    v_filas := v_filas + 1;
  end loop;

  select count(*) into v_esperadas from public.group_standings where group_id = v_group;
  if v_filas <> v_esperadas then
    raise exception 'standings_incompletos'
      using hint = format('Llegaron %s filas y el grupo tiene %s parejas. La tabla se '
                          'escribe entera o no se escribe.', v_filas, v_esperadas);
  end if;

  return jsonb_build_object(
    'ok', true,
    'match_id', p_match_id,
    'group_id', v_group,
    'borrado', v_borrando,
    'era_correccion', (v_era = 'finished'),
    'standings_escritos', v_filas
  );
end $$;

revoke all on function public.record_expres_result(uuid,uuid,timestamptz,int,int,jsonb,jsonb)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role, igual que su gemela larga.

comment on function public.record_expres_result(uuid,uuid,timestamptz,int,int,jsonb,jsonb) is
  'Captura de un partido de grupo de un torneo exprés (suma 6). No recibe '
  'ganador porque un suma 6 no tiene: escribe winner_pair_id null y cierra el '
  'partido con status. Compara el estado del grupo por MARCADOR y no por '
  'ganador, que en exprés siempre es null.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte)
--
--   select proname, pg_get_function_identity_arguments(oid)
--     from pg_proc where proname = 'record_expres_result';
--
--   -- y que nadie más que service_role la pueda llamar:
--   select has_function_privilege('authenticated',
--     'public.record_expres_result(uuid,uuid,timestamptz,int,int,jsonb,jsonb)', 'execute');
--   -- debe salir false
-- ────────────────────────────────────────────────────────────
