-- 065_sortear_desempate.sql  ·  RALLY
--
-- GUARDAR EL SORTEO DEL ORGANIZADOR
--
--   Cuando un grupo acaba en empate que el reglamento no separa —el ciclo
--   perfecto del grupo J de 5a Varonil: tres parejas, 2 puntos, mismos sets y
--   mismos games— el orden que se publica sale de un desempate tecnico por
--   `pairId`. Sembrar asi es dejar que un UUID elija al primero del grupo.
--
--   El sorteo es la salida. La app lo baraja, lo ENSEÑA antes de guardar, y
--   esta funcion lo persiste.
--
-- CUANDO SE PUEDE, Y CUANDO YA NO
--   Se puede rehacer mientras el cuadro NO este sembrado: hasta ahi es una
--   decision reversible. Despues no, porque cambiar el orden movería a quien ya
--   esta colocado en el cuadro.
--
--   Y se invalida solo si cambia un resultado del grupo: eso NO lo hace esta
--   funcion, lo hace el motor, que solo aplica el orden a un bloque que sigue
--   siendo un empate irresoluble con exactamente esas parejas (ver 064).
--
-- LO QUE ESTA FUNCION NO COMPRUEBA, Y POR QUE
--   Que el empate exista de verdad. Eso es la cadena de desempate completa
--   —mini-tabla, sets, games, % de games— y vive en el motor, en TypeScript.
--   No hace falta duplicarla aqui: por la regla de arriba, un orden escrito
--   sobre un grupo que SI esta decidido no reordena nada. Se ignora solo.
--
-- PERMISOS
--   Owner del organizador o admin, igual que `ajustar_clasificados` (060). Un
--   juez captura resultados; sortear no es capturar.

create or replace function public.sortear_desempate(
  p_group_id uuid,
  p_orden    jsonb   -- [{pair_id, orden}, ...] con orden 1..n
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria uuid;
  v_torneo    uuid;
  v_org       uuid;
  v_pendientes int;
  v_cuadro    int;
  v_filas     int := 0;
  r           jsonb;
begin
  select g.category_id, c.tournament_id
    into v_categoria, v_torneo
  from public.groups g
  join public.categories c on c.id = g.category_id
  where g.id = p_group_id;
  if v_categoria is null then raise exception 'grupo_no_existe'; end if;

  v_org := public.tournament_org(v_torneo);
  if not (public.is_org_owner(v_org) or public.is_admin()) then
    raise exception 'no_autorizado';
  end if;

  -- Sortear un grupo a medias no tiene sentido: el empate puede deshacerse
  -- con el resultado que falta.
  select count(*) into v_pendientes
  from public.matches
  where group_id = p_group_id and status <> 'finished';
  if v_pendientes > 0 then
    raise exception 'grupo_incompleto: % partidos sin resultado', v_pendientes;
  end if;

  -- Despues de sembrar, el orden ya movio gente al cuadro.
  select count(*) into v_cuadro
  from public.matches
  where category_id = v_categoria and stage <> 'group';
  if v_cuadro > 0 then
    raise exception 'cuadro_ya_sembrado';
  end if;

  -- Se reescribe entero: el sorteo anterior de este grupo se va.
  update public.group_standings
     set desempate_manual = null
   where group_id = p_group_id;

  for r in select * from jsonb_array_elements(p_orden) loop
    update public.group_standings
       set desempate_manual = (r->>'orden')::int,
           updated_at       = now()
     where group_id = p_group_id
       and pair_id  = (r->>'pair_id')::uuid;
    if found then v_filas := v_filas + 1; end if;
  end loop;

  if v_filas <> jsonb_array_length(p_orden) then
    raise exception 'pareja_fuera_del_grupo: % de % filas', v_filas, jsonb_array_length(p_orden);
  end if;

  return jsonb_build_object('ok', true, 'group_id', p_group_id, 'parejas', v_filas);
end $$;

comment on function public.sortear_desempate(uuid,jsonb) is
  'Guarda el orden sorteado entre parejas empatadas sin desempate posible. '
  'Owner del organizador o admin. Exige grupo completo y cuadro sin sembrar. '
  'Se puede rehacer hasta que se siembre.';

revoke all     on function public.sortear_desempate(uuid,jsonb) from public, anon;
grant  execute on function public.sortear_desempate(uuid,jsonb) to authenticated;
