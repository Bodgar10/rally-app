-- 014 · RPC atómica para persistir el resultado de un partido de grupos (Sprint 3)
-- Recibe lo YA calculado por el engine en la Edge Function. No llama al engine.
-- NOTA: numerada 014 (012_find_user_rpc y 013_tournament_judges ya existen).
-- AUTH: igual que 011, NO usamos auth.uid() (corremos vía service_role, donde es
-- NULL). Verificamos explícitamente contra p_actor las 3 ramas de captura
-- (admin | owner del organizador dueño | juez asignado al torneo).

create or replace function public.record_match_result(
  p_actor       uuid,        -- auth.uid() del que captura (re-verificado aquí)
  p_match_id    uuid,
  p_winner_pair uuid,
  p_played_at   timestamptz,
  p_sets        jsonb,       -- [{set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b}, ...]
  p_standings   jsonb        -- [{pair_id,played,won,lost,sets_won,sets_lost,games_won,games_lost,points,position,clinch_status}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_group      uuid;
  v_status     text;
  s            jsonb;
begin
  -- Cargar contexto del partido y bloquear la fila
  select tournament_id, group_id, status into v_tournament, v_group, v_status
  from public.matches where id = p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;

  -- Autorización servidor: verificación explícita contra p_actor (patrón 011),
  -- porque vía service_role auth.uid() es NULL y can_capture_tournament() fallaría.
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

  -- Guard de idempotencia básica: si ya está finished con el mismo ganador, no duplicar sets.
  -- (Permitimos RE-captura/edición: regrabamos sets y standings, pero NO tocamos rating.)
  delete from public.match_sets where match_id = p_match_id;
  for s in select * from jsonb_array_elements(p_sets) loop
    insert into public.match_sets
      (match_id, set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b)
    values (
      p_match_id,
      (s->>'set_number')::int,
      (s->>'games_a')::int,
      (s->>'games_b')::int,
      coalesce((s->>'is_super_tiebreak')::boolean, false),
      nullif(s->>'tiebreak_a','')::int,
      nullif(s->>'tiebreak_b','')::int
    );
  end loop;

  -- Actualizar el partido
  update public.matches
     set winner_pair_id = p_winner_pair,
         status         = 'finished',
         played_at      = coalesce(p_played_at, now())
   where id = p_match_id;

  -- Regrabar standings del grupo (todas las filas calculadas por computeStandings + clinch)
  for s in select * from jsonb_array_elements(p_standings) loop
    update public.group_standings
       set played       = (s->>'played')::int,
           won          = (s->>'won')::int,
           lost         = (s->>'lost')::int,
           sets_won     = (s->>'sets_won')::int,
           sets_lost    = (s->>'sets_lost')::int,
           games_won    = (s->>'games_won')::int,
           games_lost   = (s->>'games_lost')::int,
           points       = (s->>'points')::int,
           position     = (s->>'position')::int,
           clinch_status= (s->>'clinch_status')::clinch_status,
           updated_at   = now()
     where group_id = v_group and pair_id = (s->>'pair_id')::uuid;
  end loop;

  return jsonb_build_object('ok', true, 'match_id', p_match_id, 'group_id', v_group);
end $$;

revoke all on function public.record_match_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb) from public, anon, authenticated;
-- La invoca solo la Edge Function con service role.
