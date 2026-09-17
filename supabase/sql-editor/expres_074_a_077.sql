-- ════════════════════════════════════════════════════════════════════════════
-- EXPRES_074_A_077.sql  ·  RALLY
--
-- LAS CUATRO MIGRACIONES DEL TORNEO EXPRÉS, EN UNA SOLA TRANSACCIÓN
--
--   Este archivo NO es una migración: es el paquete para pegar de una vez en
--   el SQL Editor. Las migraciones de verdad, una por una, están en
--   supabase/migrations/074..077 y son la fuente. Este archivo se genera de
--   ellas y no se edita a mano.
--
-- POR QUÉ NO BASTA CON PEGAR LOS CUATRO SEGUIDOS
--
--   Cada uno trae su propio begin/commit, así que pegados serían CUATRO
--   transacciones. Si la tercera falla, las dos primeras ya están aplicadas y
--   la base queda a medio camino: con el modo y el formato creados pero sin
--   las funciones que los usan. Aquí los begin/commit internos se han quitado
--   y todo va dentro de uno solo — entran los cuatro o no entra ninguno.
--
-- QUÉ HACE, EN UNA LÍNEA CADA UNO
--
--   074  El modo del torneo ('largo' por defecto, así que nada existente
--        cambia), el formato de partido, y las tablas de configuración y de
--        formato por etapa del exprés.
--   075  El partido que no tiene ganador: matches.formato distingue "sin
--        ganador por diseño" de "sin capturar", con un constraint que lo
--        vuelve imposible de escribir mal.
--   076  record_expres_result: la captura de un suma 6.
--   077  sembrar_expres: el sorteo y el calendario, de una vez o de ninguna.
--
-- ANTES DE EJECUTAR
--
--   1. La 075 comprueba que no haya partidos 'finished' sin winner_pair_id y
--      aborta TODO si los encuentra. Es a propósito: si eso existe hoy, hay
--      que mirarlo antes de poner el candado.
--
--   2. NO LO CORRAS CON UN TORNEO EN JUEGO. Añadir una columna y un constraint
--      a `matches`, y una columna generada a `group_standings`, toma un lock
--      exclusivo sobre esas dos tablas — y al ir todo en UNA transacción, ese
--      lock se mantiene hasta el final en vez de soltarse por pasos. Son
--      tablas chicas y durará un momento, pero ese momento un juez capturando
--      lo ve como la app colgada. Hazlo entre torneos.
--
-- SI ALGO FALLA
--
--   No se ha aplicado nada. Copia el error entero y mándalo.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  074_expres_modo.sql                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 074_expres_modo.sql  ·  RALLY
--
-- EL TORNEO EXPRÉS ENTRA EN EL MODELO SIN TOCAR EL TORNEO LARGO
--
--   Un exprés dura una tarde, tiene UNA categoría, dos grupos que se turnan
--   las canchas y se juega a suma 6. Un torneo largo son dos o tres días y
--   ocho categorías. Son dos productos, no dos configuraciones del mismo.
--
--   Esta migración solo AÑADE. `tournaments.modo` nace con default 'largo', o
--   sea que todos los torneos que existen hoy —incluido el de 165 parejas que
--   ya se jugó— siguen siendo exactamente lo que eran, y ninguna consulta
--   actual cambia de resultado.
--
-- POR QUÉ LA CONFIGURACIÓN VA EN SU PROPIA TABLA Y NO EN `tournaments`
--
--   Porque casi todas sus columnas serían NULL para el 100% de los torneos
--   existentes, y una columna que casi siempre es NULL no se puede declarar
--   obligatoria. En su propia tabla sí: si hay fila, está completa. El cupo,
--   la semilla del sorteo y los partidos por pareja son NOT NULL ahí dentro.
--
-- LO QUE NO HACE FALTA TOCAR, Y CONVIENE DECIRLO
--
--   `categories` ya sirve tal cual: un exprés es una categoría con
--   num_groups = 2, advance_per_group = 4, best_extra_qualifiers = 0 y
--   format_type = 'groups_then_knockout'. `groups` guarda la A y la B con su
--   `name` de siempre. Y el desempate que decide el organizador reutiliza
--   `group_standings.desempate_manual` (064) y la RPC `sortear_desempate`
--   (065) SIN CAMBIOS: esa función ya recibe el orden decidido en un jsonb y
--   se limita a persistirlo — da igual que lo haya elegido un sorteo o una
--   persona.


-- ────────────────────────────────────────────────────────────
-- 1. Modo del torneo
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tournament_modo') then
    create type public.tournament_modo as enum ('largo', 'expres');
  end if;
end $$;

alter table public.tournaments
  add column if not exists modo public.tournament_modo not null default 'largo';

comment on column public.tournaments.modo is
  'largo = fase de grupos en uno o dos días + eliminatoria (lo de siempre). '
  'expres = una tarde, una categoría, dos grupos a suma 6. El default es '
  '''largo'': ningún torneo existente cambia de comportamiento.';

-- ────────────────────────────────────────────────────────────
-- 2. Formato de partido
--    Hoy el formato es del TORNEO ENTERO (tercer_set_formato, migración 063).
--    En un exprés cambia por etapa: los grupos son suma 6, cuartos y semis un
--    set a punto de oro, y la final la elige el organizador.
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'formato_partido') then
    create type public.formato_partido as enum (
      'suma_6',          -- 6 games exactos, SIN ganador del partido
      'set_oro',         -- un set a punto de oro
      'dos_sets_oro',    -- dos sets a punto de oro
      'set_star_point'   -- un set con star point
    );
  end if;
end $$;

comment on type public.formato_partido is
  'Cómo se juega un partido. ''suma_6'' es el único que NO produce ganador: se '
  'suman los games a favor y se restan los del rival.';

-- ────────────────────────────────────────────────────────────
-- 3. Configuración del exprés
-- ────────────────────────────────────────────────────────────

create table if not exists public.expres_config (
  tournament_id        uuid primary key references public.tournaments(id) on delete cascade,
  created_at           timestamptz not null default now(),

  cupo                 int  not null,
  partidos_por_pareja  int  not null default 5,
  clasifican_por_grupo int  not null default 4,

  semilla_sorteo       text not null,
  sorteado_at          timestamptz,

  -- El cupo tiene que ser PAR y de 12 para arriba. No es una preferencia:
  -- 5 partidos por pareja es impar, así que cada grupo necesita un número par
  -- de parejas y el total también. Con 13 inscritas no existe reparto posible.
  -- Y clasifican 4 por grupo, así que el grupo mínimo es 6.
  constraint expres_config_cupo_par check (cupo >= 12 and cupo % 2 = 0),
  constraint expres_config_partidos check (partidos_por_pareja between 1 and 30),
  constraint expres_config_clasifican check (clasifican_por_grupo between 1 and 8),
  constraint expres_config_semilla check (length(btrim(semilla_sorteo)) between 1 and 200)
);

comment on table public.expres_config is
  'Configuración del torneo exprés. Si hay fila, está completa: cupo, semilla y '
  'partidos por pareja son obligatorios. Un exprés sin fila aquí no se puede armar.';

comment on column public.expres_config.cupo is
  'Parejas con las que se cierra la inscripción. PAR y >= 12 — ver el check.';

comment on column public.expres_config.partidos_por_pareja is
  'Partidos que juega CADA pareja. Cinco. No es una calibración: 5 × 30 min son '
  'las 2 h 30 de pádel que el organizador anuncia, y que todas jueguen lo mismo '
  'es lo único que hace comparables los balances de games de la tabla. '
  'Tiene que ser <= (tamaño del grupo más pequeño − 1); eso lo valida el motor.';

comment on column public.expres_config.semilla_sorteo is
  'Semilla del sorteo de grupos. El reparto A/B es aleatorio para el organizador '
  'y una función pura para el motor: con esta semilla y la lista de parejas se '
  'reproduce el sorteo entero, que es lo que permite enseñarlo ante una '
  'reclamación. Sin ella no hay nada que auditar.';

comment on column public.expres_config.sorteado_at is
  'Cuándo se ejecutó el sorteo. Mientras sea null se puede volver a sortear; '
  'después la semilla queda congelada — ver el trigger de abajo.';

-- La configuración exprés solo tiene sentido en un torneo exprés.
create or replace function public.expres_config_solo_expres()
returns trigger
language plpgsql
as $$
declare v_modo public.tournament_modo;
begin
  select t.modo into v_modo from public.tournaments t where t.id = new.tournament_id;
  if v_modo is distinct from 'expres' then
    raise exception 'expres_config_en_torneo_largo'
      using hint = 'Pon tournaments.modo = ''expres'' antes de crear su configuración.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_expres_config_solo_expres on public.expres_config;
create trigger trg_expres_config_solo_expres
  before insert or update on public.expres_config
  for each row execute function public.expres_config_solo_expres();

-- La semilla define el fixture ENTERO: quién está en qué grupo y contra quién
-- juega cada ronda. Cambiarla con el torneo sorteado reescribiría partidos ya
-- jugados. Se congela en el momento del sorteo.
create or replace function public.expres_semilla_inmutable()
returns trigger
language plpgsql
as $$
begin
  if old.sorteado_at is not null then
    if new.semilla_sorteo is distinct from old.semilla_sorteo then
      raise exception 'expres_semilla_inmutable'
        using hint = 'El sorteo ya se hizo. Cambiar la semilla cambiaría los grupos y el calendario.';
    end if;
    if new.cupo is distinct from old.cupo
       or new.partidos_por_pareja is distinct from old.partidos_por_pareja then
      raise exception 'expres_cupo_inmutable'
        using hint = 'El sorteo ya se hizo: el cupo y los partidos por pareja definen el fixture.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_expres_semilla_inmutable on public.expres_config;
create trigger trg_expres_semilla_inmutable
  before update on public.expres_config
  for each row execute function public.expres_semilla_inmutable();

-- ────────────────────────────────────────────────────────────
-- 4. Formato y duración POR ETAPA
--    Un suma 6 se planifica a 30 minutos y una final a 45. Con un solo
--    `tournaments.match_minutes` para todo el torneo, el horario de un exprés
--    sale mal por los dos lados.
-- ────────────────────────────────────────────────────────────

create table if not exists public.expres_etapa (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage         public.match_stage not null,
  formato       public.formato_partido not null,
  minutos       int not null,

  primary key (tournament_id, stage),
  constraint expres_etapa_minutos check (minutos between 10 and 180),
  constraint expres_etapa_stage   check (stage in ('group', 'quarter', 'semi', 'final'))
);

comment on table public.expres_etapa is
  'Cómo se juega y cuánto se planifica cada etapa de un exprés. El estándar es '
  'group = suma_6 / 30, quarter = set_oro / 30, semi = set_oro / 30, y final = '
  'lo que elija el organizador (dos_sets_oro o set_star_point) / 45. '
  'NO se rellena sola: sin fila para una etapa, esa etapa no se puede planificar, '
  'y eso es a propósito — un valor por defecto inventado sale como un horario '
  'que parece correcto.';

comment on column public.expres_etapa.minutos is
  'Minutos a los que se PLANIFICA el partido, no los que dura. Un suma 6 se '
  'juega en 30 y puede irse a 45: el horario se arma con 30, igual que '
  'Capacidad.minutosPorPartido en el planificador de torneos largos.';

-- ────────────────────────────────────────────────────────────
-- 5. RLS — mismo patrón que `categories` (008) y el cuadro público (040)
-- ────────────────────────────────────────────────────────────

alter table public.expres_config enable row level security;
alter table public.expres_etapa  enable row level security;

drop policy if exists expres_config_admin_all on public.expres_config;
create policy expres_config_admin_all on public.expres_config
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists expres_config_select on public.expres_config;
create policy expres_config_select on public.expres_config
  for select to anon, authenticated
  using (
    public.tournament_status(tournament_id) <> 'draft'
    or public.is_org_member(public.tournament_org(tournament_id))
    or public.is_admin()
  );

drop policy if exists expres_config_write_owner on public.expres_config;
create policy expres_config_write_owner on public.expres_config
  for all to authenticated
  using (public.is_org_owner(public.tournament_org(tournament_id)))
  with check (public.is_org_owner(public.tournament_org(tournament_id)));

drop policy if exists expres_etapa_admin_all on public.expres_etapa;
create policy expres_etapa_admin_all on public.expres_etapa
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists expres_etapa_select on public.expres_etapa;
create policy expres_etapa_select on public.expres_etapa
  for select to anon, authenticated
  using (
    public.tournament_status(tournament_id) <> 'draft'
    or public.is_org_member(public.tournament_org(tournament_id))
    or public.is_admin()
  );

drop policy if exists expres_etapa_write_owner on public.expres_etapa;
create policy expres_etapa_write_owner on public.expres_etapa
  for all to authenticated
  using (public.is_org_owner(public.tournament_org(tournament_id)))
  with check (public.is_org_owner(public.tournament_org(tournament_id)));

comment on policy expres_config_select on public.expres_config is
  'El formato es público en cuanto el torneo deja de ser borrador: el jugador '
  'tiene que poder ver a qué se va a jugar antes de inscribirse.';

-- Los GRANT van explícitos aunque Supabase tenga privilegios por defecto para
-- las tablas nuevas del esquema public: si esa configuración cambia o el
-- proyecto se restaura en otro sitio, una policy correcta sobre una tabla sin
-- grant devuelve "permission denied" y cuesta un rato entender por qué.
grant select on public.expres_config to anon, authenticated;
grant select on public.expres_etapa  to anon, authenticated;
grant insert, update, delete on public.expres_config to authenticated;
grant insert, update, delete on public.expres_etapa  to authenticated;


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte)
--
--   select modo, count(*) from public.tournaments group by modo;
--   -- todos deben salir 'largo'
--
--   select column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'expres_config' order by ordinal_position;
--
--   select enumlabel from pg_enum
--     join pg_type on pg_type.oid = pg_enum.enumtypid
--    where typname = 'formato_partido' order by enumsortorder;
-- ────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  075_expres_partido_sin_ganador.sql                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  076_record_expres_result.sql                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  077_sembrar_expres.sql                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 077_sembrar_expres.sql  ·  RALLY
--
-- EL SORTEO Y EL CALENDARIO, DE UNA VEZ O DE NINGUNA
--
--   Sembrar un exprés son cuatro escrituras que dependen entre sí: los dos
--   grupos, el reparto de parejas, las filas de tabla y los 20..40 partidos
--   del calendario. Hoy la fase de grupos de un torneo largo se monta con
--   inserts sueltos desde una Edge Function, y ahí es tolerable porque cada
--   grupo se puede rehacer.
--
--   Aquí no. Si el sorteo se cae a la mitad queda un torneo con el grupo A
--   sembrado y el B vacío, y no hay forma de continuarlo: repetir el sorteo
--   daría OTRO reparto —la semilla es la misma pero el estado ya no—, y
--   arreglarlo a mano significa escribir un calendario de 40 partidos en el
--   SQL Editor un domingo a mediodía.
--
--   Por eso es una función y no una tanda de inserts: o está el torneo entero
--   o no está nada.
--
-- EL FIXTURE VIENE CALCULADO, NO SE CALCULA AQUÍ
--
--   El reparto en grupos y las rondas salen de `generarFixtureExpres`, que es
--   TypeScript probado con 1593 tests. Reimplementar el círculo recortado en
--   PL/pgSQL sería tener dos calendarios que un día no coinciden. Esta función
--   comprueba que lo que le llega es coherente —las parejas son las del
--   torneo, nadie repite rival, todos juegan lo mismo— y lo escribe.
--
-- SE SIEMBRA UNA VEZ
--
--   `expres_config.sorteado_at` es el candado: con valor, esta función se
--   niega. Volver a sortear con partidos ya jugados borraría resultados, y la
--   migración 074 además congela la semilla en ese momento.


drop function if exists public.sembrar_expres(uuid,uuid,jsonb,jsonb);

create or replace function public.sembrar_expres(
  p_actor       uuid,
  p_category_id uuid,
  p_grupos      jsonb,   -- [{name:'A', pair_ids:[uuid,...]}, {name:'B', pair_ids:[...]}]
  p_partidos    jsonb    -- [{grupo,ronda,orden,pair_a_id,pair_b_id,scheduled_at,court_label}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_modo       public.tournament_modo;
  v_sorteado   timestamptz;
  v_cupo       int;
  v_k          int;
  g            jsonb;
  m            jsonb;
  v_group_id   uuid;
  v_grupos     jsonb := '{}'::jsonb;   -- name -> group_id
  v_pair       uuid;
  v_parejas    int := 0;
  v_partidos   int := 0;
  v_esperados  int;
begin
  -- ── Contexto y candados ──────────────────────────────────────────────────
  select c.tournament_id into v_tournament
    from public.categories c where c.id = p_category_id for update;
  if not found then raise exception 'category_not_found'; end if;

  select t.modo into v_modo from public.tournaments t where t.id = v_tournament;
  if v_modo is distinct from 'expres' then
    raise exception 'not_an_expres_tournament'
      using hint = 'Este torneo no es exprés. La fase de grupos larga se monta por su camino.';
  end if;

  select ec.sorteado_at, ec.cupo, ec.partidos_por_pareja
    into v_sorteado, v_cupo, v_k
    from public.expres_config ec where ec.tournament_id = v_tournament
    for update;
  if not found then
    raise exception 'sin_expres_config'
      using hint = 'Falta la configuración del exprés: cupo, semilla y partidos por pareja.';
  end if;
  if v_sorteado is not null then
    raise exception 'expres_ya_sorteado'
      using hint = format('Este torneo se sorteó el %s. Volver a sortear daría otro reparto y '
                          'borraría los resultados capturados.', v_sorteado);
  end if;

  -- ── Autorización explícita (patrón 011: p_actor, no auth.uid()) ──────────
  if not (
    exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
    or exists (select 1 from public.organizer_members om
                where om.organizer_id = public.tournament_org(v_tournament)
                  and om.user_id = p_actor and om.member_role = 'owner')
  ) then
    raise exception 'not_authorized'
      using hint = 'Sortear no es capturar: hace falta ser owner del organizador o admin.';
  end if;

  -- ── Nada sembrado todavía ────────────────────────────────────────────────
  if exists (select 1 from public.groups where category_id = p_category_id) then
    raise exception 'grupos_ya_existen'
      using hint = 'Esta categoría ya tiene grupos. Bórralos antes de volver a sembrar.';
  end if;

  -- ── Coherencia de lo que llega ───────────────────────────────────────────
  if jsonb_array_length(p_grupos) <> 2 then
    raise exception 'expres_son_dos_grupos'
      using hint = format('Llegaron %s grupos. Un exprés tiene exactamente dos: A y B.',
                          jsonb_array_length(p_grupos));
  end if;

  -- Todas las parejas del reparto tienen que ser de esta categoría, y todas
  -- las de la categoría tienen que estar repartidas. Una pareja que se queda
  -- fuera del sorteo no se entera hasta que busca su nombre en la tabla.
  for g in select * from jsonb_array_elements(p_grupos) loop
    for v_pair in select (value #>> '{}')::uuid from jsonb_array_elements(g->'pair_ids') loop
      if not exists (select 1 from public.pairs p
                      where p.id = v_pair and p.category_id = p_category_id) then
        raise exception 'pareja_ajena'
          using hint = format('La pareja %s no es de esta categoría.', v_pair);
      end if;
      v_parejas := v_parejas + 1;
    end loop;
  end loop;

  if v_parejas <> v_cupo then
    raise exception 'cupo_no_cuadra'
      using hint = format('El reparto trae %s parejas y el cupo es %s.', v_parejas, v_cupo);
  end if;
  if v_parejas <> (select count(*) from public.pairs where category_id = p_category_id) then
    raise exception 'parejas_sin_repartir'
      using hint = 'Hay parejas inscritas que no aparecen en ningún grupo.';
  end if;

  v_esperados := v_parejas * v_k / 2;
  if jsonb_array_length(p_partidos) <> v_esperados then
    raise exception 'calendario_no_cuadra'
      using hint = format('Llegaron %s partidos y con %s parejas a %s partidos cada una tienen '
                          'que ser %s.', jsonb_array_length(p_partidos), v_parejas, v_k, v_esperados);
  end if;

  -- ── 1. Los grupos ────────────────────────────────────────────────────────
  for g in select * from jsonb_array_elements(p_grupos) loop
    insert into public.groups (category_id, name)
    values (p_category_id, g->>'name')
    returning id into v_group_id;

    v_grupos := v_grupos || jsonb_build_object(g->>'name', v_group_id::text);

    -- ── 2. La tabla, a cero ────────────────────────────────────────────────
    --
    --   Se crean las filas AHORA y no en la primera captura: la tabla tiene
    --   que poder enseñarse desde el minuto cero, con todas las parejas a
    --   cero. Una tabla que va apareciendo según se juega no deja ver quién
    --   está en tu grupo antes de empezar.
    --
    --   won/lost/sets/points se quedan en su default 0 y no se tocan nunca:
    --   en un exprés no significan nada. `balance` es columna generada (075).
    for v_pair in select (value #>> '{}')::uuid from jsonb_array_elements(g->'pair_ids') loop
      insert into public.group_standings (group_id, pair_id, played, games_won, games_lost,
                                          position, clinch_status)
      values (v_group_id, v_pair, 0, 0, 0, 0, 'alive');
    end loop;
  end loop;

  -- ── 3. El calendario ─────────────────────────────────────────────────────
  --
  --   formato = 'suma_6' va explícito: sin él, el trigger de la 075 rechaza el
  --   insert, y con razón — un partido de grupo de exprés sin formato caería
  --   en la rama "terminado sin ganador" del constraint y no se podría cerrar
  --   nunca.
  for m in select * from jsonb_array_elements(p_partidos) loop
    if not (v_grupos ? (m->>'grupo')) then
      raise exception 'grupo_desconocido'
        using hint = format('El partido apunta al grupo "%s", que no está en el reparto.',
                            m->>'grupo');
    end if;

    insert into public.matches (
      tournament_id, category_id, stage, group_id, round_label,
      pair_a_id, pair_b_id, formato, status, scheduled_at, court_label
    ) values (
      v_tournament,
      p_category_id,
      'group',
      (v_grupos->>(m->>'grupo'))::uuid,
      format('Ronda %s', m->>'ronda'),
      (m->>'pair_a_id')::uuid,
      (m->>'pair_b_id')::uuid,
      'suma_6',
      'scheduled',
      nullif(m->>'scheduled_at','')::timestamptz,
      nullif(m->>'court_label','')
    );
    v_partidos := v_partidos + 1;
  end loop;

  -- ── 4. El candado ────────────────────────────────────────────────────────
  update public.expres_config
     set sorteado_at = now()
   where tournament_id = v_tournament;

  return jsonb_build_object(
    'ok', true,
    'category_id', p_category_id,
    'tournament_id', v_tournament,
    'grupos', v_grupos,
    'parejas', v_parejas,
    'partidos', v_partidos
  );
end $$;

revoke all on function public.sembrar_expres(uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role, igual que el resto.

comment on function public.sembrar_expres(uuid,uuid,jsonb,jsonb) is
  'Siembra un exprés entero —grupos, reparto, tabla a cero y calendario— en una '
  'sola transacción. El fixture llega calculado por generarFixtureExpres; aquí '
  'solo se comprueba que cuadra y se escribe. Se siembra una vez: '
  'expres_config.sorteado_at es el candado.';


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte, sobre un torneo de prueba)
--
--   select proname from pg_proc where proname = 'sembrar_expres';
--
--   -- después de sembrar:
--   select g.name, count(*) from public.groups g
--     join public.group_standings gs on gs.group_id = g.id
--    where g.category_id = '<categoria>' group by g.name;
--
--   select round_label, count(*) from public.matches
--    where category_id = '<categoria>' and stage = 'group'
--    group by round_label order by round_label;
--   -- cada ronda debe tener tamaño_grupo/2 partidos por grupo
--
--   select count(*) from public.matches
--    where category_id = '<categoria>' and formato <> 'suma_6' and stage = 'group';
--   -- 0
-- ────────────────────────────────────────────────────────────

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN — ejecutar DESPUÉS, en otra pestaña
--
--   -- 1. Ningún torneo existente ha cambiado de modo
--   select modo, count(*) from public.tournaments group by modo;
--
--   -- 2. Las dos tablas nuevas están y tienen RLS
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename in ('expres_config','expres_etapa');
--
--   -- 3. El candado del ganador está puesto y nada lo viola
--   select conname from pg_constraint where conname = 'matches_ganador_coherente';
--   select count(*) from public.matches where status = 'finished' and winner_pair_id is null;
--   -- 0
--
--   -- 4. Las dos funciones existen y NO las puede llamar el cliente
--   select proname from pg_proc
--    where proname in ('record_expres_result','sembrar_expres');
--   select has_function_privilege('authenticated',
--     'public.record_expres_result(uuid,uuid,timestamptz,int,int,jsonb,jsonb)', 'execute');
--   -- false
--
--   -- 5. El balance se calcula solo
--   select pair_id, games_won, games_lost, balance from public.group_standings limit 5;
-- ════════════════════════════════════════════════════════════════════════════
