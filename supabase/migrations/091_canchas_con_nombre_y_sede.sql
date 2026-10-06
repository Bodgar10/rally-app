-- 091 · Las canchas dejan de ser un número y pasan a ser una lista con sede.
--
-- EL CASO QUE LO PIDE
--   Mundo Pádel organiza su torneo de aniversario en DOS sucursales a la vez:
--   Narvarte con 2 canchas y Alberca Olímpica con 3. La gente elige a cuál se
--   apunta, los grupos se juegan repartidos, y las eliminatorias se juegan
--   todas en Alberca Olímpica.
--
--   Hoy eso no se puede decir. `tournaments.courts` es un entero y
--   `schedule-groups` etiqueta los partidos como `Cancha ${n}`. El jugador
--   leería "Cancha 4" sin saber a qué sucursal ir — que es exactamente el
--   problema que esta app existe para resolver.
--
-- POR QUÉ NO ES UN CASO ESPECIAL
--   Se valoró tratar el multi-sede aparte, como se hizo con el exprés. No es lo
--   mismo: el exprés vive aparte porque sus matemáticas son incompatibles —seis
--   juegos sin ganador, siete resultados por partido—. Dos sedes no cambia
--   ninguna regla del juego. Cambia DÓNDE están las canchas y nada más.
--
--   Así que esto no añade un caso: GENERALIZA el que había. Un torneo de una
--   sola sede deja de ser lo normal y pasa a ser el caso trivial del general —
--   una sede con cinco canchas. Partirlo en dos caminos habría dejado dos
--   planificadores que mantener y uno de los dos sin arreglar.
--
-- `tournaments.courts` SE QUEDA, Y PASA A SER DERIVADA
--   La lee `schedule-groups`, `expres-sortear` y el panel. Vaciarla de golpe
--   habría roto los tres a la vez para arreglar uno. Un trigger la mantiene
--   igual al número de canchas de la tabla nueva, así que todo lo que hoy la
--   lee sigue leyendo la verdad sin enterarse del cambio.
--
--   Deja de escribirse a mano: la pantalla de Canchas pasa a editar la lista.
--
-- LA SEDE DE LA CANCHA ES NULL CUANDO EL TORNEO TIENE UNA SOLA
--   No se copia la del torneo "por si acaso". Null significa "la del torneo", y
--   es lo que permite que un club que se muda de sede no tenga que reescribir
--   sus canchas. El relleno de abajo sí la copia para los torneos que ya
--   existen, porque ahí la sede ya estaba decidida y perderla sería inventar.

begin;

-- ── La tabla ────────────────────────────────────────────────────────────────

create table if not exists public.tournament_courts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  tournament_id uuid not null references public.tournaments(id) on delete cascade,

  -- Null = la sede del torneo. Ver la cabecera.
  venue_id      uuid references public.venues(id) on delete set null,

  -- Lo que lee el jugador en su partido: 'Cancha 2', 'Narvarte 1', 'Central'.
  nombre        text not null,

  -- El orden en que el planificador las reparte. Estable a propósito: una
  -- categoría que vuelve a jugar prefiere sus canchas de siempre, y para eso
  -- el número de cancha tiene que significar lo mismo entre bloques.
  orden         int  not null,

  -- Dos canchas con el mismo nombre en un torneo son un error de captura, y
  -- uno caro: el partido diría "Cancha 2" y habría dos.
  unique (tournament_id, nombre),
  unique (tournament_id, orden),

  constraint tournament_courts_nombre check (length(btrim(nombre)) between 1 and 40),
  constraint tournament_courts_orden  check (orden >= 1)
);

create index if not exists tournament_courts_torneo_idx
  on public.tournament_courts(tournament_id, orden);

create index if not exists tournament_courts_sede_idx
  on public.tournament_courts(tournament_id, venue_id);

comment on table public.tournament_courts is
  'Las canchas de un torneo, con nombre y sede. Sustituye a tournaments.courts, '
  'que pasa a ser derivada: un trigger la mantiene igual a cuantas filas hay '
  'aqui. venue_id null = la sede del torneo.';

comment on column public.tournament_courts.venue_id is
  'La sucursal de esta cancha. Null = la sede del torneo, que es el caso de '
  'cualquier torneo de una sola sede.';

-- ── RLS, espejo de tournament_windows (044) ─────────────────────────────────

alter table public.tournament_courts enable row level security;

-- El horario y el sitio de un torneo publicado no son secretos: el jugador
-- quiere saber a que sucursal va antes de inscribirse.
drop policy if exists tournament_courts_select on public.tournament_courts;
create policy tournament_courts_select on public.tournament_courts
for select to anon, authenticated
using (
  public.tournament_status(tournament_id) <> 'draft'
  or public.is_org_member(public.tournament_org(tournament_id))
  or public.is_admin()
);

drop policy if exists tournament_courts_write_owner on public.tournament_courts;
create policy tournament_courts_write_owner on public.tournament_courts
for all to authenticated
using (public.is_org_owner(public.tournament_org(tournament_id)))
with check (public.is_org_owner(public.tournament_org(tournament_id)));

grant select on public.tournament_courts to anon, authenticated;
grant insert, update, delete on public.tournament_courts to authenticated;

-- ── `tournaments.courts` pasa a derivada ────────────────────────────────────
--
-- SE PONE A NULL CON CERO CANCHAS, no a 0: su CHECK de la 044 exige
-- `courts is null or courts between 1 and 30`, y null ya significa "todavia no
-- se ha dicho" en todo el codigo que la lee.

create or replace function public.sincronizar_courts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_torneo uuid; v_n int;
begin
  v_torneo := coalesce(new.tournament_id, old.tournament_id);
  select count(*) into v_n from public.tournament_courts where tournament_id = v_torneo;
  update public.tournaments
     set courts = case when v_n = 0 then null else v_n end
   where id = v_torneo;
  return null;
end $$;

drop trigger if exists trg_sincronizar_courts on public.tournament_courts;
create trigger trg_sincronizar_courts
  after insert or update or delete on public.tournament_courts
  for each row execute function public.sincronizar_courts();

comment on function public.sincronizar_courts is
  'Mantiene tournaments.courts igual al numero de filas de tournament_courts. '
  'Existe para que schedule-groups, expres-sortear y el panel sigan leyendo esa '
  'columna sin enterarse de que las canchas ahora tienen nombre.';

-- ── Relleno de lo que ya existe ─────────────────────────────────────────────
--
-- Cada torneo con canchas capturadas estrena su lista con los nombres que la
-- app ya pintaba: 'Cancha 1'..'Cancha N'. Asi ningun partido ya programado
-- cambia de etiqueta — `matches.court_label` ya dice exactamente eso.
--
-- La sede SI se copia aqui: en estos torneos ya estaba decidida, y dejarla en
-- null obligaria a adivinarla despues.

insert into public.tournament_courts (tournament_id, venue_id, nombre, orden)
select t.id, t.venue_id, 'Cancha ' || g.n, g.n
from public.tournaments t
cross join lateral generate_series(1, t.courts) as g(n)
where t.courts is not null
  and not exists (
    select 1 from public.tournament_courts c where c.tournament_id = t.id
  );

commit;
