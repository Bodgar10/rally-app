-- ============================================================================
-- 055_bloque_congelado_al_cerrar.sql  ·  RALLY
--
-- La elección de bloque se congela cuando se cierra la CATEGORÍA.
--
-- EL HUECO
--   La RLS de la 051 deja escribir a la pareja mientras
--   `tournament_status(...) = 'registration_open'`. Pero desde la migración 035
--   el torneo NO pasa a 'in_progress' al cerrar la primera categoría, sino la
--   ÚLTIMA. Así que una pareja cuya categoría ya está cerrada —con sus grupos
--   formados y sus partidos creados— seguía pudiendo cambiar de horario
--   mientras quedara cualquier otra categoría abierta.
--
--   Y no es inocuo: `schedule-groups` lee `pair_block_choices` para decidir en
--   qué bloque va cada grupo, por mayoría. Cambiar una elección después de
--   formar los grupos puede mover el grupo entero a otro horario, o dejarlo
--   partido entre dos. El dato deja de describir el torneo que se va a jugar.
--
-- POR QUÉ UN TRIGGER Y NO SOLO RLS
--   La RLS no se aplica a `service_role`, y por ahí pasan las Edge Functions y
--   los scripts. Un guard que solo vive en la RLS protege del jugador pero no
--   del código nuestro, que es justo el que puede escribir 165 filas de golpe.
--   El trigger vale venga la escritura de donde venga.
--
-- LA GRANULARIDAD ES LA CATEGORÍA, NO EL TORNEO
--   Los grupos se forman por categoría. En cuanto la suya cierra, la elección
--   de esa pareja ya no puede cambiar nada sin romper algo; las de las demás
--   categorías siguen abiertas y deben poder elegir.
--
-- POR QUÉ NO SE GUARDA EL DELETE
--   Borrar el torneo cascadea a `pair_block_choices`, y un trigger BEFORE
--   DELETE se dispara también en esa cascada — con la categoría todavía
--   cerrada. El guard habría bloqueado el borrado del torneo, que es lo que
--   usa `reseed-cimepa.mjs` y lo que necesita cualquier limpieza.
--
--   Y no deja hueco: cambiar de bloque exige un INSERT o un UPDATE, y los dos
--   están cerrados. Un DELETE suelto solo puede DEJAR SIN elección a una
--   pareja, que `schedule-groups` reporta como `sin_bloque` en vez de moverla
--   en silencio. Es un estado peor pero visible, no una mentira.
--
-- SI DE VERDAD HAY QUE REPARAR UNA
--   No hay puerta trasera a propósito: una excepción silenciosa acabaría
--   usándose por costumbre. Para un arreglo deliberado y consciente:
--     alter table public.pair_block_choices disable trigger trg_bloque_congelado;
--     -- ... el arreglo ...
--     alter table public.pair_block_choices enable  trigger trg_bloque_congelado;
--   Que cueste tres líneas es la idea.
--
-- Aplicar DESPUÉS de 051.
-- ============================================================================

create or replace function public.bloque_congelado_al_cerrar()
returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  v_pair     uuid;
  v_status   public.category_status;
  v_categoria text;
begin
  v_pair := new.pair_id;

  select c.status, c.display_name
    into v_status, v_categoria
  from public.pairs p
  join public.categories c on c.id = p.category_id
  where p.id = v_pair;

  -- Sin categoría no se puede decidir: se deja pasar en vez de bloquear por no
  -- saber. El FK de `pairs` ya garantiza que exista en el camino normal.
  if not found then
    return new;
  end if;

  if v_status <> 'open' then
    raise exception
      'bloque_congelado: la categoría % ya está cerrada (%). Los grupos están formados y cambiar el horario elegido los rompería.',
      v_categoria, v_status
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists trg_bloque_congelado on public.pair_block_choices;
create trigger trg_bloque_congelado
  before insert or update on public.pair_block_choices
  for each row execute function public.bloque_congelado_al_cerrar();

comment on function public.bloque_congelado_al_cerrar() is
  'Impide tocar pair_block_choices cuando la categoria de la pareja ya no esta '
  'open. Va como TRIGGER y no solo como RLS porque la RLS no aplica a '
  'service_role, que es por donde escriben las Edge Functions. Solo INSERT y '
  'UPDATE: el DELETE se deja pasar porque el borrado en cascada del torneo lo '
  'dispararia y bloquearia la limpieza. Ver migracion 055.';
