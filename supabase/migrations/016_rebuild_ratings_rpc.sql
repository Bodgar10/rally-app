-- 016 · RPC atómica: reescribe player_ratings + rating_history de UNA división (Sprint 3+)
-- Recibe lo YA calculado por el engine (replay cronológico). No llama al engine.
-- Patrón 011/014/015: revocada de roles cliente; solo service_role la invoca.
-- NOTA: player_ratings ya trae unique(player_id, division) desde 002; el índice de abajo
--       es redundante pero idempotente (no rompe). on conflict usa esa unicidad.

create unique index if not exists player_ratings_player_division_uniq
  on public.player_ratings (player_id, division);

create or replace function public.rebuild_division_ratings(
  p_division        text,
  p_player_ratings  jsonb,   -- [{player_id,rating,rd,volatility,last_played_at}, ...]
  p_history         jsonb    -- [{player_id,match_id,rating_before,rating_after,rd_before,rd_after,volatility_before,volatility_after,played_at}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; h jsonb; v_players int := 0; v_hist int := 0;
begin
  -- 1) Borrar el historial recomputado de esta división (solo los matches en alcance)
  delete from public.rating_history
   where division = p_division::division
     and match_id in (select (x->>'match_id')::uuid from jsonb_array_elements(p_history) x);

  -- 2) Upsert de los ratings finales por jugador
  for r in select * from jsonb_array_elements(p_player_ratings) loop
    insert into public.player_ratings (player_id, division, rating, rd, volatility, last_played_at)
    values (
      (r->>'player_id')::uuid, p_division::division,
      (r->>'rating')::numeric, (r->>'rd')::numeric, (r->>'volatility')::numeric,
      nullif(r->>'last_played_at','')::timestamptz
    )
    on conflict (player_id, division) do update
      set rating = excluded.rating, rd = excluded.rd,
          volatility = excluded.volatility, last_played_at = excluded.last_played_at,
          updated_at = now();
    v_players := v_players + 1;
  end loop;

  -- 3) Reinsertar el historial completo (orden cronológico ya garantizado por el caller).
  --    rating_history exige volatility_before/after NOT NULL (esquema 002).
  for h in select * from jsonb_array_elements(p_history) loop
    insert into public.rating_history
      (player_id, division, match_id, rating_before, rating_after,
       rd_before, rd_after, volatility_before, volatility_after, played_at)
    values (
      (h->>'player_id')::uuid, p_division::division, (h->>'match_id')::uuid,
      (h->>'rating_before')::numeric, (h->>'rating_after')::numeric,
      (h->>'rd_before')::numeric, (h->>'rd_after')::numeric,
      (h->>'volatility_before')::numeric, (h->>'volatility_after')::numeric,
      (h->>'played_at')::timestamptz
    );
    v_hist := v_hist + 1;
  end loop;

  return jsonb_build_object('ok', true, 'division', p_division, 'players', v_players, 'history', v_hist);
end $$;

revoke all on function public.rebuild_division_ratings(text, jsonb, jsonb) from public, anon, authenticated;
