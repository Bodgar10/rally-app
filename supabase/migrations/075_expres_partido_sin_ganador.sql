-- 075_expres_partido_sin_ganador.sql  ·  RALLY
--
-- EL PARTIDO QUE NO TIENE GANADOR
--
--   Un suma 6 son seis games y no hay ganador del partido: sumas los que
--   ganaste y restas los que te hicieron. Un 3-3 no es un empate que contar,
--   es sumar 3 y restar 3.
--
--   Hoy el modelo no sabe expresar eso. `matches.winner_pair_id` en null
--   significa UNA sola cosa: "todavía no se ha capturado". Si un suma 6
--   terminado se guardara así, sería indistinguible de un partido pendiente, y
--   el grupo se quedaría abierto para siempre — que es exactamente el fallo que
--   hay que evitar.
--
-- LA SOLUCIÓN: EL FORMATO LO DICE
--
--   `matches.formato` distingue las dos cosas sin ambigüedad:
--
--     formato = 'suma_6'  +  status = 'finished'  → jugado, y no tiene ganador.
--     formato = 'suma_6'  +  status = 'scheduled' → todavía no se ha jugado.
--     formato null o otro +  status = 'finished'  → jugado, y TIENE ganador.
--
--   O sea que en un suma 6 lo que cierra el partido es `status`, no
--   `winner_pair_id`. Y un constraint lo vuelve imposible de escribir mal: un
--   suma 6 con ganador se rechaza, y un partido normal terminado sin ganador
--   también.
--
--   `formato` es NULL para todo lo que existe hoy, y null significa "el
--   formato del torneo, lo de siempre". Ni una fila cambia de comportamiento.

begin;

-- ────────────────────────────────────────────────────────────
-- 1. El formato de cada partido
-- ────────────────────────────────────────────────────────────

alter table public.matches
  add column if not exists formato public.formato_partido;

comment on column public.matches.formato is
  'Cómo se juega ESTE partido. null = el formato del torneo (tercer_set_formato, '
  'migración 063), que es el comportamiento de siempre. ''suma_6'' es el único '
  'que no produce ganador: ahí winner_pair_id es null POR DISEÑO, y lo que dice '
  'que el partido acabó es status = ''finished''.';

-- ────────────────────────────────────────────────────────────
-- 2. Antes de poner el candado, comprobar que nada lo rompe ya
--
--    Si esto revienta, la migración entera se deshace y no se ha tocado nada:
--    el SQL Editor corre el archivo en una transacción.
-- ────────────────────────────────────────────────────────────

do $$
declare v_sucios int;
begin
  select count(*) into v_sucios
    from public.matches
   where status = 'finished' and winner_pair_id is null;

  if v_sucios > 0 then
    raise exception
      'Hay % partido(s) con status=''finished'' y winner_pair_id null. El '
      'constraint de abajo los rechazaría. Míralos con: select id, tournament_id, '
      'stage, status from public.matches where status = ''finished'' and '
      'winner_pair_id is null;', v_sucios;
  end if;
end $$;

alter table public.matches
  drop constraint if exists matches_ganador_coherente;

alter table public.matches
  add constraint matches_ganador_coherente check (
    case
      -- Un suma 6 NUNCA tiene ganador, ni siquiera terminado.
      when formato = 'suma_6' then winner_pair_id is null
      -- Cualquier otro partido terminado SIEMPRE lo tiene.
      when status = 'finished' then winner_pair_id is not null
      else true
    end
  );

comment on constraint matches_ganador_coherente on public.matches is
  'Las dos caras de "sin ganador": por diseño (suma 6) o por falta de capturar. '
  'Sin este candado las dos se escriben igual y el grupo no se cierra nunca.';

-- ────────────────────────────────────────────────────────────
-- 3. En un exprés el formato es obligatorio
--
--    Un partido de grupo de un exprés creado sin formato caería en la rama
--    "terminado sin ganador" del constraint y no se podría cerrar jamás. Mejor
--    que no se pueda ni crear.
-- ────────────────────────────────────────────────────────────

create or replace function public.match_formato_expres()
returns trigger
language plpgsql
as $$
declare v_modo public.tournament_modo;
begin
  select t.modo into v_modo from public.tournaments t where t.id = new.tournament_id;
  if v_modo is distinct from 'expres' then
    return new;   -- torneo largo: aquí no se decide nada
  end if;

  if new.formato is null then
    raise exception 'expres_formato_obligatorio'
      using hint = 'En un exprés cada partido lleva su formato. Sale de expres_etapa.';
  end if;

  if new.stage = 'group' and new.formato <> 'suma_6' then
    raise exception 'expres_grupo_es_suma6'
      using hint = 'La fase de grupos de un exprés se juega siempre a suma 6.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_match_formato_expres on public.matches;
create trigger trg_match_formato_expres
  before insert or update on public.matches
  for each row execute function public.match_formato_expres();

-- ────────────────────────────────────────────────────────────
-- 4. El marcador de un suma 6, validado en la base
--
--    Los siete marcadores posibles son 6-0, 5-1, 4-2, 3-3 y sus espejos. Un
--    5-5 o un 6-4 son marcadores de otro deporte. El motor ya lo valida, pero
--    una fila escrita a mano desde el SQL Editor se saltaría el motor.
-- ────────────────────────────────────────────────────────────

create or replace function public.match_sets_suma6_valido()
returns trigger
language plpgsql
as $$
declare v_formato public.formato_partido;
begin
  select m.formato into v_formato from public.matches m where m.id = new.match_id;
  if v_formato is distinct from 'suma_6' then
    return new;
  end if;

  if new.set_number <> 1 then
    raise exception 'suma6_un_solo_marcador'
      using hint = 'Un suma 6 es un único marcador de 6 games, no una serie de sets.';
  end if;

  if new.is_super_tiebreak then
    raise exception 'suma6_sin_super_muerte'
      using hint = 'En un suma 6 no hay súper muerte: no hay partido que desempatar.';
  end if;

  if new.games_a < 0 or new.games_b < 0 or new.games_a + new.games_b <> 6 then
    raise exception 'suma6_marcador_invalido'
      using hint = format(
        '%s-%s suma %s. Los marcadores posibles son 6-0, 5-1, 4-2, 3-3, 2-4, 1-5 y 0-6.',
        new.games_a, new.games_b, new.games_a + new.games_b);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_match_sets_suma6 on public.match_sets;
create trigger trg_match_sets_suma6
  before insert or update on public.match_sets
  for each row execute function public.match_sets_suma6_valido();

-- ────────────────────────────────────────────────────────────
-- 5. El balance, que es la columna que ordena la tabla de un exprés
--
--    `won`, `lost`, `sets_won`, `sets_lost` y `points` se quedan en 0 en un
--    exprés y NO se muestran: la tabla tiene cuatro columnas —PJ, GF, GC y
--    balance— porque no hay victorias que contar.
--
--    Es una columna generada: no se puede escribir a mano ni desincronizar de
--    los games. En un torneo largo también existe y ahí es solo informativa —
--    su tabla la sigue ordenando `points`.
-- ────────────────────────────────────────────────────────────

alter table public.group_standings
  add column if not exists balance int
  generated always as (games_won - games_lost) stored;

comment on column public.group_standings.balance is
  'games_won − games_lost. En un EXPRÉS es la columna que ordena la tabla, y es '
  'comparable solo porque todas las parejas juegan el mismo número de partidos. '
  'Como GF + GC es constante para todas (5 partidos × 6 games = 30), ordenar por '
  'balance, por games_won o por menos games_lost es la MISMA ordenación: no son '
  'tres criterios de desempate, es uno. En un torneo largo esta columna es '
  'informativa; allí ordena points.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte)
--
--   -- el candado está puesto y nada existente lo viola
--   select conname from pg_constraint where conname = 'matches_ganador_coherente';
--   select count(*) from public.matches where status = 'finished' and winner_pair_id is null;
--   -- 0
--
--   -- el balance se calcula solo
--   select pair_id, games_won, games_lost, balance
--     from public.group_standings limit 5;
--
--   -- y esto DEBE fallar (prueba del trigger), sobre un torneo de prueba:
--   -- insert into public.match_sets (match_id, set_number, games_a, games_b)
--   -- values ('<id de un partido suma_6>', 1, 5, 5);   -- suma6_marcador_invalido
-- ────────────────────────────────────────────────────────────
