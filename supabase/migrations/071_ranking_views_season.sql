-- 071 · ranking_public gana temporada; ranking_champions deriva los campeones.
-- Los campeones NO se materializan: se derivan del ledger. Si alguien corrige
-- un resultado de diciembre el 15 de enero, la corona se corrige sola.

begin;

-- season va al final: create or replace solo admite columnas nuevas al final.
create or replace view public.ranking_public as
  select rp.player_id, u.full_name, u.photo_url,
         rp.division, rp.points, rp."position", rp.season
    from public.ranking_points rp
    join public.users u on u.id = rp.player_id;

create or replace view public.ranking_champions as
  select rp.division, rp.season, rp.player_id,
         u.full_name, u.photo_url, rp.points, tc.torneos
    from public.ranking_points rp
    join public.users u on u.id = rp.player_id
    join (
      select trp.division,
             extract(year from t.end_date)::int as season,
             count(distinct trp.tournament_id) as torneos
        from public.tournament_ranking_points trp
        join public.tournaments t on t.id = trp.tournament_id
       group by 1, 2
    ) tc on tc.division = rp.division and tc.season = rp.season
   where rp."position" = 1
     and tc.torneos >= (select min_torneos_campeon from public.ranking_point_rules
                         where scope = 'global' limit 1)
     and rp.season < extract(year from now())::int;  -- solo temporadas cerradas

commit;
