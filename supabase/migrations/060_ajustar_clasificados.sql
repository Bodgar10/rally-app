-- 060_ajustar_clasificados.sql  ·  RALLY
--
-- AJUSTAR CLASIFICADOS Y REPESCADOS DESPUÉS DE CERRAR INSCRIPCIONES
--
-- EL HUECO QUE LLENA
--   `advance_per_group` y `best_extra_qualifiers` solo se podían tocar ANTES de
--   cerrar inscripciones. Después, nada: ni pantalla ni RPC. El organizador
--   cerraba, veía el calendario, descubría que el domingo acababa a las 21:00 o
--   que su cuadro abría en ronda de 32 con 13 byes — y no tenía cómo arreglarlo.
--   Le avisábamos del problema y le quitábamos la herramienta.
--
--   Caso real (torneo bb8e137e): 3ª y 4ª Varonil con 10 grupos × 1 + 9
--   repescados = 19 clasificados, que no caben en 16 y abrían a 32. Bajar la
--   repesca a 6 los dejó en 16 exactos y quitó 12 partidos del domingo. Hubo
--   que hacerlo con SQL a mano.
--
-- LAS TRES SITUACIONES, Y POR QUÉ SE TRATAN DISTINTO
--   1. Cerrada sin cuadro sembrado → cambio libre. No hay nada que rehacer.
--   2. Cuadro sembrado SIN resultados → se permite, borrando el cuadro. Quien
--      llama tiene que haber confirmado antes; esta función exige el flag.
--   3. Cuadro sembrado CON resultados → SE RECHAZA. Borrar un partido que dos
--      parejas jugaron de verdad, para arreglar una configuración, es destruir
--      un dato cierto. No hay flag que lo habilite: no es una advertencia, es
--      un no.
--
-- PERMISOS
--   Owner del organizador o admin. Es la misma puerta que ya tenía la tabla
--   (`categories_write_owner` / `categories_admin_all` de la 008), repetida
--   aquí porque la función es SECURITY DEFINER y se salta la RLS.
--   Un juez es miembro del tenant pero no owner: no pasa.

create or replace function public.ajustar_clasificados(
  p_category_id   uuid,
  p_advance       int,
  p_extra         int,
  p_borrar_cuadro boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_torneo    uuid;
  v_org       uuid;
  v_grupos    int;
  v_cuadro    int;
  v_jugados   int;
  v_borrados  int := 0;
begin
  if p_advance is null or p_advance < 1 then
    raise exception 'advance_invalido';
  end if;
  if p_extra is null or p_extra < 0 then
    raise exception 'extra_invalido';
  end if;

  select tournament_id into v_torneo from public.categories where id = p_category_id;
  if v_torneo is null then raise exception 'categoria_no_existe'; end if;

  v_org := public.tournament_org(v_torneo);
  if not (public.is_org_owner(v_org) or public.is_admin()) then
    raise exception 'no_autorizado';
  end if;

  -- Sin grupos armados no hay nada que ajustar: esto es para DESPUÉS de cerrar.
  select count(*) into v_grupos from public.groups where category_id = p_category_id;
  if v_grupos = 0 then raise exception 'categoria_sin_grupos'; end if;

  -- ¿Hay cuadro? ¿Y tiene algún resultado ya capturado?
  select count(*) into v_cuadro
    from public.matches where category_id = p_category_id and stage <> 'group';

  select count(*) into v_jugados
    from public.matches
   where category_id = p_category_id and stage <> 'group'
     and (status = 'finished' or winner_pair_id is not null);

  if v_jugados > 0 then
    -- Situación 3. El mensaje lo traduce la app a lenguaje de organizador.
    raise exception 'resultados_capturados: % partidos del cuadro ya tienen resultado', v_jugados;
  end if;

  if v_cuadro > 0 then
    if not p_borrar_cuadro then
      -- Situación 2 sin confirmar. Se devuelve el dato para que la app
      -- pregunte, en vez de borrar por su cuenta.
      raise exception 'cuadro_sembrado: % partidos de eliminatoria se borrarian', v_cuadro;
    end if;
    -- match_sets cae por FK on delete cascade (ver 001). No hay ninguno con
    -- resultado: acabamos de comprobarlo.
    delete from public.matches
     where category_id = p_category_id and stage <> 'group';
    get diagnostics v_borrados = row_count;
  end if;

  update public.categories
     set advance_per_group      = p_advance,
         best_extra_qualifiers  = p_extra
   where id = p_category_id;

  return jsonb_build_object(
    'ok', true,
    'category_id', p_category_id,
    'tournament_id', v_torneo,
    'advance_per_group', p_advance,
    'best_extra_qualifiers', p_extra,
    'cuadro_borrado', v_borrados,
    'hay_que_resembrar', v_borrados > 0
  );
end $$;

comment on function public.ajustar_clasificados(uuid,int,int,boolean) is
  'Ajusta advance_per_group y best_extra_qualifiers de una categoria ya cerrada. '
  'Rechaza si el cuadro tiene resultados capturados. Con p_borrar_cuadro borra '
  'el cuadro sin resultados para poder resembrarlo. Owner del organizador o admin.';

revoke all     on function public.ajustar_clasificados(uuid,int,int,boolean) from public, anon;
grant  execute on function public.ajustar_clasificados(uuid,int,int,boolean) to authenticated;
