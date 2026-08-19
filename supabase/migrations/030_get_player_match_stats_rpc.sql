-- 030_get_player_match_stats_rpc.sql
-- Stats descriptivas del jugador para PlayerAnalysis (S5-SON-03) y ranking.tsx (S5-SON-01).
-- Devuelve UN jsonb. Glicko NUNCA se expone (solo conteos derivados de matches/sets/puntos).
--
-- Definiciones (explícitas, para revisión de producto):
--   * basic: wins/losses/win_rate/streak/tournaments_played desde matches terminados.
--   * best_position = NULL: el esquema NO guarda la posición por-torneo
--     (tournament_ranking_points no tiene columna position; "position" solo vive en el
--      rollup de red ranking_points). Queda null hasta que exista esa fuente.
--   * clutch_rate = win-rate en partidos que tuvieron set de super-muerte (match_sets.is_super_tiebreak).
--   * partner_chemistry = nombre de la mejor pareja por win-rate (mín. 2 partidos juntos).
--   * avg_points_per_tournament = promedio de tournament_ranking_points.points.
--   * trend = avg puntos últimos 3 torneos vs anteriores (±5% -> rising/declining/stable; null si no hay base).
--
-- p_division es opcional: si viene (ranking.tsx), filtra por la división de la categoría
-- del par; si es null (PlayerAnalysis), agrega todas las divisiones.

create or replace function public.get_player_match_stats(
  p_player_id uuid,
  p_division  text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_division   public.division;
  v_wins       int := 0;
  v_losses     int := 0;
  v_total      int := 0;
  v_win_rate   numeric := 0;
  v_streak     int := 0;
  v_tournaments int := 0;
  v_avg_points numeric;
  v_clutch     numeric;
  v_partner    text;
  v_trend      text;
  v_recent     numeric;
  v_prior      numeric;
begin
  -- Autorización: solo el propio jugador o un admin pueden pedir estas stats.
  -- (auth.uid() es null bajo service_role -> se permite para usos server-side.)
  if auth.uid() is not null and p_player_id <> auth.uid() and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  -- División opcional (cast tolerante: valor inválido -> sin filtro).
  if p_division is not null and p_division <> '' then
    begin
      v_division := p_division::public.division;
    exception when others then
      v_division := null;
    end;
  end if;

  -- ---- Basic: wins / losses / tournaments_played ----
  with my_pairs as (
    select pr.id as pair_id
    from public.pairs pr
    join public.categories c on c.id = pr.category_id
    where (pr.player1_id = p_player_id or pr.player2_id = p_player_id)
      and (v_division is null or c.division = v_division)
  ),
  my_matches as (
    select m.tournament_id,
           (m.winner_pair_id = mp.pair_id) as won
    from public.matches m
    join my_pairs mp on mp.pair_id = m.pair_a_id or mp.pair_id = m.pair_b_id
    where m.status = 'finished' and m.winner_pair_id is not null
  )
  select count(*) filter (where won),
         count(*) filter (where not won),
         count(distinct tournament_id)
  into v_wins, v_losses, v_tournaments
  from my_matches;

  v_total := v_wins + v_losses;
  v_win_rate := case when v_total > 0
                     then round((v_wins::numeric / v_total) * 100, 1)
                     else 0 end;

  -- ---- Racha actual de victorias (más reciente hacia atrás, corta en la 1ª derrota) ----
  with my_pairs as (
    select pr.id as pair_id
    from public.pairs pr
    join public.categories c on c.id = pr.category_id
    where (pr.player1_id = p_player_id or pr.player2_id = p_player_id)
      and (v_division is null or c.division = v_division)
  ),
  ordered as (
    select (m.winner_pair_id = mp.pair_id) as won,
           row_number() over (order by coalesce(m.played_at, m.created_at) desc) as rn
    from public.matches m
    join my_pairs mp on mp.pair_id = m.pair_a_id or mp.pair_id = m.pair_b_id
    where m.status = 'finished' and m.winner_pair_id is not null
  )
  select count(*)
  into v_streak
  from ordered
  where won
    and rn < coalesce((select min(rn) from ordered where not won), 2147483647);

  -- ---- Clutch rate: win-rate en partidos con set de super-muerte ----
  with my_pairs as (
    select pr.id as pair_id
    from public.pairs pr
    join public.categories c on c.id = pr.category_id
    where (pr.player1_id = p_player_id or pr.player2_id = p_player_id)
      and (v_division is null or c.division = v_division)
  ),
  clutch as (
    select (m.winner_pair_id = mp.pair_id) as won
    from public.matches m
    join my_pairs mp on mp.pair_id = m.pair_a_id or mp.pair_id = m.pair_b_id
    where m.status = 'finished' and m.winner_pair_id is not null
      and exists (select 1 from public.match_sets ms
                  where ms.match_id = m.id and ms.is_super_tiebreak)
  )
  select case when count(*) > 0
              then round((count(*) filter (where won))::numeric / count(*) * 100, 1)
              else null end
  into v_clutch
  from clutch;

  -- ---- Partner chemistry: mejor pareja por win-rate (mín. 2 partidos juntos) ----
  with my_pairs as (
    select pr.id as pair_id,
           case when pr.player1_id = p_player_id then pr.player2_id else pr.player1_id end as partner_id
    from public.pairs pr
    join public.categories c on c.id = pr.category_id
    where (pr.player1_id = p_player_id or pr.player2_id = p_player_id)
      and (v_division is null or c.division = v_division)
  ),
  partner_matches as (
    select mp.partner_id, (m.winner_pair_id = mp.pair_id) as won
    from public.matches m
    join my_pairs mp on mp.pair_id = m.pair_a_id or mp.pair_id = m.pair_b_id
    where m.status = 'finished' and m.winner_pair_id is not null
  ),
  partner_stats as (
    select partner_id, count(*) as games, count(*) filter (where won) as wins
    from partner_matches
    group by partner_id
    having count(*) >= 2
  )
  select u.full_name
  into v_partner
  from partner_stats ps
  join public.users u on u.id = ps.partner_id
  order by (ps.wins::numeric / ps.games) desc, ps.games desc
  limit 1;

  -- ---- Avg points por torneo + trend (desde tournament_ranking_points) ----
  select round(avg(points)::numeric, 0)
  into v_avg_points
  from public.tournament_ranking_points
  where player_id = p_player_id
    and (v_division is null or division = v_division);

  with trp as (
    select points,
           row_number() over (order by created_at desc) as rn
    from public.tournament_ranking_points
    where player_id = p_player_id
      and (v_division is null or division = v_division)
  )
  select avg(points) filter (where rn <= 3),
         avg(points) filter (where rn > 3)
  into v_recent, v_prior
  from trp;

  v_trend := case
    when v_prior is null or v_recent is null then null
    when v_recent > v_prior * 1.05 then 'rising'
    when v_recent < v_prior * 0.95 then 'declining'
    else 'stable'
  end;

  return jsonb_build_object(
    'wins', v_wins,
    'losses', v_losses,
    'win_rate', v_win_rate,
    'streak', v_streak,
    'tournaments_played', v_tournaments,
    'best_position', null,
    'partner_chemistry', v_partner,
    'clutch_rate', v_clutch,
    'avg_points_per_tournament', v_avg_points,
    'trend', v_trend
  );
end;
$$;

revoke all     on function public.get_player_match_stats(uuid, text) from public, anon;
grant  execute on function public.get_player_match_stats(uuid, text) to authenticated, service_role;
