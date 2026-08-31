-- ============================================================================
-- 051_pair_block_choices.sql  ·  RALLY
--
-- La pareja ELIGE su bloque horario al inscribirse.
--
-- DE DONDE SALE LA REGLA
--   Del Sexto Torneo Cimepa: un grupo de 3 parejas se juega como un bloque de
--   3 horas seguidas en una cancha, y 52 de 55 grupos siguieron esa regla. El
--   viernes de 14:00 a 17:00 solo se ocuparon 3 canchas de 8 — no por
--   desperdicio, sino porque a esa hora la gente trabaja. Preguntar horarios
--   uno por uno convertia al organizador en el responsable del horario que le
--   tocaba a cada quien. Aqui se reserva, como un asiento.
--
-- POR QUE `bloque_id` ES TEXTO Y NO UNA FK
--   Los bloques son DERIVADOS, no una tabla: `generarBloques` los calcula a
--   partir de las ventanas del torneo (`tournament_windows`), las canchas
--   (`tournaments.courts`) y los minutos por partido. Su id es estable y
--   deterministico — `${dia}-${desde}`, p.ej. '2026-03-14-08:00' — pero no hay
--   fila a la que apuntar.
--
--   CONSECUENCIA ACEPTADA: si el organizador cambia las ventanas o las canchas,
--   una eleccion puede quedar apuntando a un bloque que ya no existe. Eso NO es
--   una violacion de integridad: es un dato a revalidar. La pantalla de
--   ocupacion del organizador lo muestra como "bloque que ya no existe" y la
--   pareja vuelve a elegir. Por eso no hay FK ni trigger que borre nada.
--
-- POR QUE `pair_id` ES LA PRIMARY KEY
--   Una eleccion por pareja, firme, sin primera y segunda opcion. La unicidad
--   no es un indice mas: es la forma de la tabla.
--
-- POR QUE LA FK ES COMPUESTA (pair_id, tournament_id)
--   `tournament_id` se duplica aqui para que la RLS del organizador no tenga
--   que entrar a `pairs` en cada fila. Duplicar un dato invita a que se
--   desincronice, asi que la FK compuesta contra `pairs(id, tournament_id)`
--   hace imposible guardar una eleccion cuyo torneo no sea el de la pareja.
--
-- Aplicada a mano en el SQL Editor. Idempotente.
-- Aplicar DESPUES de 001 (pairs), 008 (helpers de RLS) y 044 (courts).
-- ============================================================================

-- La FK compuesta necesita un unique al que apuntar. `id` ya es PK, asi que
-- este unique es redundante en datos pero obligatorio para el referenciador.
alter table public.pairs
  drop constraint if exists pairs_id_tournament_key;
alter table public.pairs
  add constraint pairs_id_tournament_key unique (id, tournament_id);

create table if not exists public.pair_block_choices (
  pair_id       uuid primary key,
  tournament_id uuid not null,

  -- `${dia}-${desde}` tal como lo emite `generarBloques`. El check no valida
  -- que el bloque exista (no puede: es derivado), solo que tenga la forma.
  bloque_id     text not null
    check (bloque_id ~ '^\d{4}-\d{2}-\d{2}-([01][0-9]|2[0-3]):[0-5][0-9]$'),

  -- El organizador SI puede meter una pareja en un bloque lleno: esa pareja ya
  -- le pago. Queda marcada para que la pantalla de ocupacion pueda explicar
  -- por que ese bloque esta sobrevendido, en vez de parecer un error de cuentas.
  forzado       boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint pair_block_choices_pair_fkey
    foreign key (pair_id, tournament_id)
    references public.pairs (id, tournament_id)
    on delete cascade
);

create index if not exists pair_block_choices_tournament_idx
  on public.pair_block_choices (tournament_id, bloque_id);

comment on table public.pair_block_choices is
  'Bloque horario que eligio cada pareja al inscribirse. Una por pareja, firme. '
  'bloque_id es el id derivado de generarBloques (${dia}-${desde}), no una FK: '
  'si cambian las ventanas del torneo la eleccion se revalida, no falla.';
comment on column public.pair_block_choices.forzado is
  'El organizador la metio en un bloque sin cupo. La pareja puede quedarse sin '
  'grupo completo; el aviso se dio antes de guardar.';

-- updated_at a mano: cambiar de bloque es un dato que el organizador consulta.
create or replace function public.touch_pair_block_choice()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pair_block_choices_touch on public.pair_block_choices;
create trigger pair_block_choices_touch
  before update on public.pair_block_choices
  for each row execute function public.touch_pair_block_choice();


-- ── Helper: ¿esta pareja es mia? ────────────────────────────────────────────
-- SECURITY DEFINER para no encadenar la RLS de `pairs` dentro de la RLS de
-- esta tabla (mismo patron que is_org_owner / is_tournament_participant).
create or replace function public.is_my_pair(p_pair_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.pairs p
    where p.id = p_pair_id
      and (p.player1_id = auth.uid() or p.player2_id = auth.uid())
  );
$$;

grant execute on function public.is_my_pair(uuid) to authenticated;


-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.pair_block_choices enable row level security;

-- LEER: la pareja la suya; el organizador (y el juez, que es org_member) todas
-- las de su torneo. Mismo alcance que `pairs_select`, para que la pantalla de
-- ocupacion pueda unir las dos sin sorpresas.
drop policy if exists pair_block_choices_select on public.pair_block_choices;
create policy pair_block_choices_select on public.pair_block_choices
  for select to authenticated
  using (
    public.is_admin()
    or public.is_my_pair(pair_id)
    or public.is_org_member(public.tournament_org(tournament_id))
  );

-- ESCRIBIR: la pareja mientras el torneo siga abierto; el organizador siempre
-- (arregla despues de cerrar si hace falta).
-- `forzado` solo lo puede poner el owner: es una decision suya, no del jugador.
drop policy if exists pair_block_choices_insert on public.pair_block_choices;
create policy pair_block_choices_insert on public.pair_block_choices
  for insert to authenticated
  with check (
    public.is_admin()
    or public.is_org_owner(public.tournament_org(tournament_id))
    or (
      public.is_my_pair(pair_id)
      and forzado = false
      and public.tournament_status(tournament_id) = 'registration_open'
    )
  );

drop policy if exists pair_block_choices_update on public.pair_block_choices;
create policy pair_block_choices_update on public.pair_block_choices
  for update to authenticated
  using (
    public.is_admin()
    or public.is_org_owner(public.tournament_org(tournament_id))
    or (
      public.is_my_pair(pair_id)
      and public.tournament_status(tournament_id) = 'registration_open'
    )
  )
  with check (
    public.is_admin()
    or public.is_org_owner(public.tournament_org(tournament_id))
    or (
      public.is_my_pair(pair_id)
      and forzado = false
      and public.tournament_status(tournament_id) = 'registration_open'
    )
  );

drop policy if exists pair_block_choices_delete on public.pair_block_choices;
create policy pair_block_choices_delete on public.pair_block_choices
  for delete to authenticated
  using (
    public.is_admin()
    or public.is_org_owner(public.tournament_org(tournament_id))
    or (
      public.is_my_pair(pair_id)
      and public.tournament_status(tournament_id) = 'registration_open'
    )
  );


-- ── Ocupacion agregada ──────────────────────────────────────────────────────
-- El jugador que esta eligiendo necesita saber cuanto cupo queda, pero NO puede
-- leer las elecciones de los demas. Esta funcion devuelve solo cuentas: bloque,
-- categoria y cuantas parejas. Ningun dato personal sale de aqui.
--
-- La categoria sale de `pairs`, no de esta tabla: `cupoDeBloque` la necesita
-- porque un grupo son 3 parejas de la MISMA categoria y cada grupo ocupa un
-- carril entero.
create or replace function public.bloques_ocupacion(p_tournament_id uuid)
returns table (bloque_id text, category_id uuid, parejas int)
language sql stable security definer set search_path = public
as $$
  select c.bloque_id, p.category_id, count(*)::int
    from public.pair_block_choices c
    join public.pairs p on p.id = c.pair_id
   where c.tournament_id = p_tournament_id
   group by c.bloque_id, p.category_id;
$$;

grant execute on function public.bloques_ocupacion(uuid) to anon, authenticated;


-- ── Verificacion ────────────────────────────────────────────────────────────
-- Ocupacion de un torneo:
-- select * from public.bloques_ocupacion('<tournament_id>') order by bloque_id;
--
-- Parejas inscritas que todavia no eligieron bloque:
-- select p.id, p.category_id
--   from public.pairs p
--   left join public.pair_block_choices c on c.pair_id = p.id
--  where p.tournament_id = '<id>' and c.pair_id is null;
--
-- Elecciones forzadas por el organizador:
-- select bloque_id, count(*) from public.pair_block_choices
--  where tournament_id = '<id>' and forzado group by 1;
