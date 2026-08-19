-- 027_sponsors_schema_rls.sql
-- Tienda-leads (Doc A §4.15 / §6). NO es e-commerce: los productos no se cobran;
-- "apartar" crea un lead que se le pasa al patrocinador fuera de la plataforma.
--
-- VARIANTE CASO B + RECONCILIACIÓN DE DRIFT (§1):
--   * 004_sponsors_leads.sql ya creó las 4 tablas, sus enums (product_type/lead_status)
--     y los índices base. Aquí NO se recrean.
--   * El remoto tenía además políticas RLS aplicadas a mano en el SQL Editor que NUNCA
--     se versionaron (drift). Esta migración las DROPEA y deja UN solo juego autoritativo,
--     de modo que un `db push` limpio reproduzca exactamente este estado.
--
-- Decisiones de reconciliación:
--   - Se ELIMINAN las permisivas `*: lectura autenticada` (qual auth.role()='authenticated'),
--     porque leían sponsors/productos INACTIVOS y anulaban por OR el requisito del .md
--     ("lectura del catálogo activo"). Quedan solo los *_select_active.
--   - Se CONSERVA (portada a nombre limpio) la feature viva del organizador:
--       tsp_owner_manage = el owner gestiona los sponsors de SUS torneos.
--   - Se ELIMINA la visibilidad del organizador sobre leads ("owner ve los de sus
--     torneos"): los leads llevan PII + consentimiento para el PATROCINADOR (Doc C
--     §5.3), no para los miembros del organizador. Solo el dueño del lead y el admin
--     los ven. La política queda como drop-if-exists SIN create, para que un push
--     limpio reproduzca su ausencia.
--   - Se eliminan los duplicados/subconjuntos exactos (admin gestiona, jugador inserta,
--     jugador ve los suyos, lectura autenticada de tournament_sponsors).
-- Idempotente: drop policy if exists antes de cada create; create index if not exists.

-- ---------- Índices nuevos sobre FKs que 004 no indexó ----------
create index if not exists idx_tournament_sponsors_tournament
  on public.tournament_sponsors(tournament_id);
create index if not exists idx_sponsor_leads_product
  on public.sponsor_leads(product_id);

-- ---------- RLS ----------
alter table public.sponsors            enable row level security;
alter table public.tournament_sponsors enable row level security;
alter table public.sponsor_products    enable row level security;
alter table public.sponsor_leads       enable row level security;

-- ===== Limpieza de drift: políticas pre-existentes aplicadas a mano (sin versionar) =====
drop policy if exists "sponsors: admin gestiona"                 on public.sponsors;
drop policy if exists "sponsors: lectura autenticada"            on public.sponsors;
drop policy if exists "sponsor_products: admin gestiona"         on public.sponsor_products;
drop policy if exists "sponsor_products: lectura autenticada"    on public.sponsor_products;
drop policy if exists "tournament_sponsors: lectura autenticada" on public.tournament_sponsors;
drop policy if exists "tournament_sponsors: owner gestiona"      on public.tournament_sponsors;
drop policy if exists "sponsor_leads: jugador inserta"           on public.sponsor_leads;
drop policy if exists "sponsor_leads: jugador ve los suyos"      on public.sponsor_leads;
drop policy if exists "sponsor_leads: owner ve los de sus torneos" on public.sponsor_leads;
-- Visibilidad del organizador sobre leads: ELIMINADA por privacidad (ver cabecera).
-- drop-if-exists SIN create -> un push limpio reproduce su ausencia.
drop policy if exists leads_select_tournament_owner on public.sponsor_leads;

-- ===== sponsors: admin gestiona todo; authenticated lee solo los activos =====
drop policy if exists sponsors_admin_all on public.sponsors;
create policy sponsors_admin_all on public.sponsors
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists sponsors_select_active on public.sponsors;
create policy sponsors_select_active on public.sponsors
  for select to authenticated
  using (active = true);

-- ===== tournament_sponsors: admin gestiona; el owner gestiona los de SUS torneos;
--       authenticated lee el vínculo (qué sponsor en qué torneo) =====
drop policy if exists tsp_admin_all on public.tournament_sponsors;
create policy tsp_admin_all on public.tournament_sponsors
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists tsp_owner_manage on public.tournament_sponsors;
create policy tsp_owner_manage on public.tournament_sponsors
  for all to authenticated
  using (
    exists (
      select 1
      from public.tournaments t
      join public.organizer_members om on om.organizer_id = t.organizer_id
      where t.id = tournament_sponsors.tournament_id
        and om.user_id = auth.uid()
        and om.member_role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.tournaments t
      join public.organizer_members om on om.organizer_id = t.organizer_id
      where t.id = tournament_sponsors.tournament_id
        and om.user_id = auth.uid()
        and om.member_role = 'owner'
    )
  );

drop policy if exists tsp_select_all on public.tournament_sponsors;
create policy tsp_select_all on public.tournament_sponsors
  for select to authenticated
  using (true);

-- ===== sponsor_products: admin gestiona; authenticated lee productos activos de sponsors activos =====
drop policy if exists products_admin_all on public.sponsor_products;
create policy products_admin_all on public.sponsor_products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_select_active on public.sponsor_products;
create policy products_select_active on public.sponsor_products
  for select to authenticated
  using (
    active = true
    and exists (
      select 1 from public.sponsors s
      where s.id = sponsor_products.sponsor_id and s.active = true
    )
  );

-- ===== sponsor_leads: el dueño inserta y lee los suyos; el owner ve los de sus torneos;
--       admin lee/gestiona todo. (El camino de escritura real es la Edge Function
--       sponsor-lead con service_role; estas políticas son defensa en profundidad.) =====
drop policy if exists leads_insert_own on public.sponsor_leads;
create policy leads_insert_own on public.sponsor_leads
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists leads_select_own on public.sponsor_leads;
create policy leads_select_own on public.sponsor_leads
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists leads_admin_write on public.sponsor_leads;
create policy leads_admin_write on public.sponsor_leads
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists leads_admin_delete on public.sponsor_leads;
create policy leads_admin_delete on public.sponsor_leads
  for delete to authenticated
  using (public.is_admin());
