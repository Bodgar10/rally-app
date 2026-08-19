-- 026_finish_tournament_rpc.sql
-- Cierre orquestado del torneo. Transiciona in_progress -> finished de forma
-- atómica, idempotente y autorizada contra p_actor (NO auth.uid(), porque la
-- RPC corre con service_role desde la Edge Function). Patrón de 011/014/015/016/018.

create or replace function public.finish_tournament(
  p_actor          uuid,
  p_tournament_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   text;
  v_org      uuid;
  v_is_admin boolean := false;
  v_is_owner boolean := false;
begin
  -- Existencia + estado actual
  v_status := public.tournament_status(p_tournament_id);
  if v_status is null then
    raise exception 'tournament_not_found' using errcode = 'P0002';
  end if;

  -- Idempotencia: ya terminado -> no-op
  if v_status = 'finished' then
    return jsonb_build_object(
      'ok', true,
      'already_finished', true,
      'tournament_id', p_tournament_id,
      'status', 'finished'
    );
  end if;

  -- Solo se transiciona desde in_progress
  if v_status <> 'in_progress' then
    raise exception 'invalid_status_transition' using detail = v_status;
  end if;

  -- Autorización explícita contra p_actor (admin O owner del organizador dueño)
  select coalesce(bool_or(u.role = 'admin'), false) into v_is_admin
  from public.users u where u.id = p_actor;

  v_org := public.tournament_org(p_tournament_id);

  select exists (
    select 1
    from public.organizer_members m
    where m.organizer_id = v_org
      and m.user_id = p_actor
      and m.member_role = 'owner'
  ) into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'not_authorized';
  end if;

  -- Transición
  update public.tournaments
     set status = 'finished'
   where id = p_tournament_id;

  return jsonb_build_object(
    'ok', true,
    'already_finished', false,
    'tournament_id', p_tournament_id,
    'status', 'finished'
  );
end;
$$;

revoke all     on function public.finish_tournament(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.finish_tournament(uuid, uuid) to service_role;
