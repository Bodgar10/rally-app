-- 088_expres_formato_se_rellena.sql  ·  RALLY
--
-- EL FORMATO DE UN PARTIDO DE EXPRÉS SE RELLENA SOLO
--
-- ► EL CALLEJÓN SIN SALIDA QUE SE ENCONTRÓ PROBANDO
--   Terminada la fase de grupos de un exprés, no había forma de armar el
--   cuadro. Y no era solo que faltara el botón: `generate-bracket` —la única
--   función que sabe sembrar cuartos, semis y final— NO escribe `formato`,
--   porque en un torneo largo esa columna no existe como concepto.
--
--   Y el trigger de la 075 rechaza cualquier partido de exprés sin formato:
--
--     raise exception 'expres_formato_obligatorio'
--
--   O sea que aunque se hubiera puesto el botón, habría fallado. El exprés
--   podía jugar sus 40 partidos de grupo y quedarse ahí para siempre.
--
-- ► POR QUÉ SE RELLENA EN VEZ DE EXIGIRLO
--   La 075 decidió "mejor que no se pueda ni crear", y para la fase de grupos
--   sigue siendo lo correcto: un partido de grupo sin formato caería en la
--   rama "terminado sin ganador" del constraint y no se cerraría jamás.
--
--   Pero exigirlo obliga a que CADA camino que cree un partido de exprés se
--   acuerde de ponerlo, y ya hay dos —el sorteo y el cuadro— escritos por
--   sitios distintos. El que falle es el que nadie probó.
--
--   Y no hace falta adivinar nada: `expres_etapa` YA dice el formato de cada
--   etapa de ese torneo. Es un dato que existe, es del torneo, y es exacto.
--   Rellenarlo desde ahí no es asumir: es leer.
--
-- ► SE SIGUE RECHAZANDO LO QUE DE VERDAD NO SE SABE
--   Si no hay fila en `expres_etapa` para esa etapa, no hay nada que leer y
--   el partido se rechaza igual que antes. Un exprés al que le falta una
--   etapa es un torneo a medio configurar, y eso hay que verlo al crear el
--   partido y no tres horas después.

begin;

create or replace function public.match_formato_expres()
returns trigger
language plpgsql
as $$
declare
  v_modo    public.tournament_modo;
  v_formato public.formato_partido;
begin
  select t.modo into v_modo from public.tournaments t where t.id = new.tournament_id;
  if v_modo is distinct from 'expres' then
    return new;   -- torneo largo: aquí no se decide nada
  end if;

  -- ── Sin formato: se lee de la etapa, no se rechaza ───────────────────────
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
end;
$$;

comment on function public.match_formato_expres() is
  'En un exprés cada partido lleva su formato. Si llega sin él se RELLENA desde '
  'expres_etapa, que es el dato exacto de ese torneo — así ningún camino que '
  'cree partidos tiene que acordarse (el sorteo lo pone; generate-bracket, que '
  'es de los torneos largos, no). Solo se rechaza cuando la etapa no está '
  'configurada: ahí de verdad no hay nada que leer.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (sobre un exprés con la fase de grupos terminada)
--
--   -- Antes de armar el cuadro: solo partidos de grupo.
--   select stage, formato, count(*) from public.matches
--    where tournament_id = '<id>' group by 1,2;
--
--   -- Después de armar el cuadro, los cuartos tienen que salir con el
--   -- formato de expres_etapa (set_oro por defecto), NO en null.
-- ────────────────────────────────────────────────────────────
