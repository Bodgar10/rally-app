-- 092 · Un torneo largo también decide cómo se juega cada etapa.
--
-- EL CASO QUE LO PIDE
--   Padel Hype juega sus torneos en un día: grupos de 4 round robin a UN SET
--   con punto de oro, cuartos y semis igual, y la final a dos de tres sets.
--   "3 partidos asegurados a 1 set", dice su cartel.
--
--   El motor largo ya sabe hacer ese torneo —round robin, dos por grupo,
--   mejores terceros, cuadro— pero no sabía que un partido pudiera ser a un
--   set: `scoreConfigDelTorneo` devuelve siempre mejor de 3. El juez habría
--   tecleado el 6-4 que cierra el partido y el botón de guardar seguiría
--   apagado pidiendo un segundo set que nadie iba a jugar.
--
-- POR QUÉ TRES COLUMNAS Y NO UNA TABLA
--   El exprés tiene `expres_etapa` con una fila por etapa, y ahí hace falta:
--   guarda además los MINUTOS de cada etapa, que su planificador necesita para
--   armar la tarde.
--
--   Un torneo largo no necesita eso. Lo que decide su organizador son tres
--   cosas, y las dice en una frase: "los grupos a un set, el cuadro a un set,
--   la final a dos de tres". Una tabla con tres filas por torneo para guardar
--   tres valores añade un join, un orden y un estado a medio escribir —dos
--   filas de tres— a cambio de nada.
--
--   Si algún día un torneo largo quiere minutos por etapa, esto se queda corto
--   y entonces sí toca la tabla. Hoy sería construir para un caso que nadie ha
--   pedido.
--
-- NULL = COMO SIEMPRE
--   Un torneo que no diga nada se juega como se ha jugado hasta hoy: mejor de
--   3 con el tercer set que diga `tercer_set_formato`. Ningún torneo existente
--   cambia de reglas por esta migración.
--
-- EL CUADRO Y LA FINAL VAN APARTE A PROPÓSITO
--   `formato_cuadro` cubre de la ronda de 32 a semifinales. La final casi
--   siempre se juega distinto —es la única que la gente se queda a ver— y
--   meterla en la misma columna obligaría a elegir entre un cuadro largo o una
--   final corta. El 3.er lugar sigue al cuadro, no a la final: se juega a la
--   vez que ella y con las piernas de tres partidos encima.

begin;

alter table public.tournaments
  add column if not exists formato_grupos public.formato_partido,
  add column if not exists formato_cuadro public.formato_partido,
  add column if not exists formato_final  public.formato_partido;

comment on column public.tournaments.formato_grupos is
  'Como se juega cada partido de la fase de grupos. Null = mejor de 3, como '
  'siempre. En un expres manda expres_etapa, no esto.';
comment on column public.tournaments.formato_cuadro is
  'De la ronda de 32 a semifinales, y el 3.er lugar. Null = mejor de 3.';
comment on column public.tournaments.formato_final is
  'Solo la final. Va aparte porque casi siempre se juega distinto al resto del '
  'cuadro. Null = mejor de 3.';

-- Un torneo largo no juega a suma 6: ese formato no tiene ganador y su tabla
-- se ordena por saldo de games, que es el motor del expres. Dejarlo entrar
-- aqui daria una fase de grupos sin ganadores que `computeStandings` no sabe
-- leer.
alter table public.tournaments
  drop constraint if exists tournaments_formatos_sin_suma6;
alter table public.tournaments
  add constraint tournaments_formatos_sin_suma6 check (
    formato_grupos is distinct from 'suma_6'
    and formato_cuadro is distinct from 'suma_6'
    and formato_final  is distinct from 'suma_6'
  );

-- ── El trigger de `matches.formato` ahora también sirve a los largos ────────
--
-- Antes salia en seco con `return new` para todo lo que no fuera expres. Ahora
-- rellena desde las tres columnas; si estan vacias deja el formato en null, que
-- es como ha estado siempre y lo que `match-result` lee como "manda el torneo".

create or replace function public.match_formato_expres()
returns trigger
language plpgsql
as $$
declare
  v_modo    public.tournament_modo;
  v_formato public.formato_partido;
  t         public.tournaments%rowtype;
begin
  select * into t from public.tournaments where id = new.tournament_id;
  v_modo := t.modo;

  -- ── TORNEO LARGO ─────────────────────────────────────────────────────────
  if v_modo is distinct from 'expres' then
    if new.formato is null then
      new.formato := case
        when new.stage = 'group' then t.formato_grupos
        when new.stage = 'final' then t.formato_final
        else t.formato_cuadro          -- r32, r16, cuartos, semis y 3.er lugar
      end;
    end if;
    -- Null sigue siendo valido: es el torneo de toda la vida.
    return new;
  end if;

  -- ── EXPRÉS ───────────────────────────────────────────────────────────────
  if new.formato is null then
    select ee.formato into v_formato
      from public.expres_etapa ee
     where ee.tournament_id = new.tournament_id
       and ee.stage = new.stage;

    if v_formato is null then
      raise exception 'expres_formato_obligatorio'
        using hint = format(
          'Este exprés no tiene configurada la etapa "%s" en expres_etapa, así que '
          'no hay formato que leer. Configúrala antes de crear sus partidos.',
          new.stage);
    end if;

    new.formato := v_formato;
  end if;

  if new.stage = 'group' and new.formato <> 'suma_6' then
    raise exception 'expres_grupo_es_suma6'
      using hint = 'La fase de grupos de un exprés se juega siempre a suma 6.';
  end if;

  return new;
end $$;

commit;
