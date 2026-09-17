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

begin;

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

commit;

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
