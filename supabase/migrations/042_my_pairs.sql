-- ============================================================================
-- 042_my_pairs.sql  ·  RALLY
--
-- El jugador está inscrito y la app no se lo dice en ninguna parte: el detalle
-- del torneo le ofrece "Inscribirme" como si nada, y el dashboard le dice "No
-- tienes partidos próximos" a alguien que juega en cuatro días.
--
-- Para arreglarlo hace falta poder enseñarle SUS inscripciones con el nombre de
-- su compañero. `pairs_select` (008) ya le deja leer sus propias parejas, pero
-- el nombre del compañero pasa por `users_select_own` (`id = auth.uid()`) y
-- vuelve null — el mismo embed roto de siempre.
--
-- Las vistas que ya existen no sirven:
--   · bracket_pairs_public (039) filtra categorías abiertas, que es justo donde
--     está el jugador que aún no ha jugado.
--   · organizer_pairs_admin (041) es solo para el owner.
--
-- No hay fuga: el jugador ya sabe con quién juega, lo eligió él.
--
-- Aplicar DESPUÉS de 001 y 008.
-- ============================================================================

create or replace view public.my_pairs as
select
  p.id          as pair_id,
  p.tournament_id,
  p.category_id,
  p.payment_status,
  p.created_at,
  p.player1_id,
  p.player2_id,
  u1.full_name  as player1_name,
  u2.full_name  as player2_name
from public.pairs p
join public.users u1 on u1.id = p.player1_id
join public.users u2 on u2.id = p.player2_id
-- El filtro va DENTRO de la vista y se evalúa por llamante: sin él, una vista
-- sin security_invoker publicaría las parejas de todo el mundo.
where p.player1_id = auth.uid()
   or p.player2_id = auth.uid();

comment on view public.my_pairs is
  'Las parejas del propio jugador, con el nombre de su companero. Existe porque '
  'users_select_own impide el embed. Solo devuelve filas donde auth.uid() es '
  'uno de los dos jugadores.';

revoke all    on public.my_pairs from anon, authenticated;
grant  select on public.my_pairs to authenticated;

-- ── Verificación (con un JWT de jugador) ────────────────────────────────────
--   select * from public.my_pairs;   -- solo sus parejas, con los dos nombres
