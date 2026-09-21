-- 083_zona_del_jugador.sql  ·  RALLY
--
-- DÓNDE JUEGA CADA QUIEN
--
-- ► EL PROBLEMA
--   `buscar_pareja` (migración 082) encuentra gente del lado contrario y del
--   mismo nivel, y eso ya es más de lo que hay en un grupo de WhatsApp. Pero
--   le faltaba lo primero que pregunta cualquiera: ¿y dónde juega?
--
--   Una pareja perfecta en nivel y en lado que entrena a hora y media de coche
--   no es una pareja: es una sugerencia que nadie va a usar. Y como la lista
--   se ordenaba solo por diferencia de rating, el más parecido de todo el país
--   salía por delante del que juega en tu mismo club.
--
-- ► LA ZONA NO SE PREGUNTA: SE DEDUCE DE DONDE YA JUGÓ
--   `users` no tiene ciudad, y añadir el campo habría significado otra
--   pregunta en un onboarding que existe precisamente para no tener ninguna.
--
--   No hace falta. Cada pareja apunta a un torneo, cada torneo a una sede y
--   cada sede tiene `city`. La ciudad donde alguien se ha inscrito MÁS veces
--   es un dato mejor que el que habría escrito él mismo: es dónde juega de
--   verdad, no dónde dice que vive.
--
--   Quien no se ha inscrito a nada todavía no tiene zona, y eso es correcto:
--   null significa "no lo sabemos", y la búsqueda entonces no filtra por
--   zona en vez de inventarse una.
--
-- ► LA ZONA ORDENA, NO EXCLUYE
--   Filtrar duro por ciudad dejaría sin resultados a quien juega en una plaza
--   pequeña, que es justo quien más necesita que le encuentren pareja. Los de
--   su zona salen PRIMERO; los de fuera siguen saliendo, detrás y marcados.

begin;

-- ────────────────────────────────────────────────────────────
-- 1. La zona de un jugador
--
--    SECURITY DEFINER porque recorre `pairs` de otra gente: la RLS de pairs
--    solo deja ver las propias. No devuelve nada más que un nombre de ciudad,
--    que es lo que ya sale en la tarjeta de cualquier torneo.
-- ────────────────────────────────────────────────────────────

create or replace function public.zona_del_jugador(p_player uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.city
    from public.pairs p
    join public.tournaments t on t.id = p.tournament_id
    join public.venues      v on v.id = t.venue_id
   where p.player1_id = p_player or p.player2_id = p_player
   group by v.city
   -- Donde más ha jugado. A empate, la ciudad del torneo más reciente: si
   -- alguien se mudó, lo último pesa más que el histórico.
   order by count(*) desc, max(t.start_date) desc
   limit 1;
$$;

revoke all     on function public.zona_del_jugador(uuid) from public, anon;
grant  execute on function public.zona_del_jugador(uuid) to authenticated;

comment on function public.zona_del_jugador(uuid) is
  'La ciudad donde más se ha inscrito a torneos. Null si todavía no se ha '
  'inscrito a ninguno — y null significa "no lo sabemos", nunca CDMX por '
  'defecto. Se deduce en vez de preguntarse: dónde juega de verdad es mejor '
  'dato que dónde dice que vive, y ahorra una pregunta en el onboarding.';

-- ────────────────────────────────────────────────────────────
-- 2. `buscar_pareja` con zona
--
--    Se reemplaza la de la 082. Cambia la FIRMA de salida (dos columnas
--    nuevas), así que hay que tirar la anterior: `create or replace` no puede
--    cambiar el tipo de retorno de una función que devuelve una tabla.
-- ────────────────────────────────────────────────────────────

drop function if exists public.buscar_pareja(public.division, int);

create function public.buscar_pareja(
  p_division public.division,
  p_limite   int default 10
)
returns table(
  player_id  uuid,
  full_name  text,
  photo_url  text,
  rating     numeric,
  rd         numeric,
  lado       public.preferred_side,
  mano       public.mano_de_juego,
  diferencia numeric,
  -- Dónde juega. Null si todavía no se ha inscrito a ningún torneo.
  zona       text,
  -- Si es la misma que la de quien busca. La pantalla lo usa para el
  -- encabezado "Por tu zona" y para la etiqueta de los de fuera.
  misma_zona boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_yo     uuid := auth.uid();
  v_lado   public.preferred_side;
  v_rating numeric;
  v_rd     numeric;
  v_zona   text;
begin
  if v_yo is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select u.preferred_side into v_lado from public.users u where u.id = v_yo;
  select pr.rating, pr.rd into v_rating, v_rd
    from public.player_ratings pr
   where pr.player_id = v_yo and pr.division = p_division;

  -- Sin lado propio no se puede buscar complemento, y sin rating fiable no se
  -- puede afirmar "de tu nivel". En los dos casos se devuelve vacío: la
  -- pantalla dice qué falta, que es más útil que una lista inventada.
  if v_lado is null or v_rating is null or v_rd >= 100 then
    return;
  end if;

  v_zona := public.zona_del_jugador(v_yo);

  return query
    with candidatos as (
      select
        u.id,
        u.full_name::text                as full_name,
        u.photo_url::text                as photo_url,
        pr.rating,
        pr.rd,
        u.preferred_side,
        u.mano,
        abs(pr.rating - v_rating)        as diferencia
      from public.users u
      join public.player_ratings pr
        on pr.player_id = u.id and pr.division = p_division
      where u.id <> v_yo
        and u.preferred_side is not null
        -- Medido: sin esto, "de tu nivel" sería una suposición.
        and pr.rd < 100
        -- Nivel parecido. 150 puntos es, más o menos, media división.
        and abs(pr.rating - v_rating) <= 150
        -- Del lado contrario. 'ambos' encaja con cualquiera, en los dos sentidos.
        and (
          v_lado = 'ambos'
          or u.preferred_side = 'ambos'
          or u.preferred_side <> v_lado
        )
    ),
    -- ► LA ZONA DE TODOS LOS CANDIDATOS, EN UNA SOLA PASADA.
    --   Llamar a `zona_del_jugador` dentro del select la ejecutaría una vez
    --   POR CANDIDATO, y además antes del limit: con doscientos compatibles
    --   son doscientos recorridos de `pairs` para quedarse con diez. Esto es
    --   el mismo criterio —donde más ha jugado, y a empate lo más reciente—
    --   resuelto de golpe.
    zonas as (
      select z.player_id, z.city
        from (
          select
            pl.player_id,
            v.city,
            row_number() over (
              partition by pl.player_id
              order by count(*) desc, max(t.start_date) desc
            ) as rn
          from (
            select p.tournament_id, p.player1_id as player_id from public.pairs p
            union all
            select p.tournament_id, p.player2_id                from public.pairs p
          ) pl
          join public.tournaments t on t.id = pl.tournament_id
          join public.venues      v on v.id = t.venue_id
          where pl.player_id in (select c.id from candidatos c)
          group by pl.player_id, v.city
        ) z
       where z.rn = 1
    )
    select
      c.id, c.full_name, c.photo_url, c.rating, c.rd,
      c.preferred_side, c.mano, c.diferencia,
      z.city,
      -- `coalesce` y no el `=` a secas: con la zona propia o la ajena en null
      -- la comparación da NULL, no false, y un null aquí se pinta como si no
      -- supiéramos la respuesta cuando la respuesta es "no".
      coalesce(z.city = v_zona, false) as misma_zona
    from candidatos c
    left join zonas z on z.player_id = c.id
    -- LA ZONA ORDENA, NO EXCLUYE: los de cerca primero, los de fuera detrás.
    -- Filtrar duro dejaría sin resultados a quien juega en plaza pequeña, que
    -- es justo quien más lo necesita.
    --
    -- El `coalesce` tampoco es de adorno: `order by <bool> desc` en Postgres
    -- pone los NULL PRIMERO, así que sin él los candidatos sin zona conocida
    -- encabezarían la lista de "por tu zona".
    order by
      coalesce(z.city = v_zona, false) desc,
      c.diferencia,
      c.full_name
    limit greatest(least(coalesce(p_limite, 10), 25), 1);
end;
$$;

revoke all     on function public.buscar_pareja(public.division, int) from public, anon;
grant  execute on function public.buscar_pareja(public.division, int) to authenticated;

comment on function public.buscar_pareja(public.division, int) is
  'Jugadores compatibles para hacer pareja: lado contrario, nivel parecido '
  '(±150 de rating, ambos medidos con RD < 100) y los de la misma zona '
  'primero. La zona ORDENA pero no excluye: en una plaza pequeña filtrar duro '
  'dejaría la lista vacía. SECURITY DEFINER porque la RLS de users solo deja '
  'ver la propia fila. NO devuelve correos: con correos sería un directorio '
  'cosechable. Para invitar a alguien se usa search_users.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte, autenticado)
--
--   select zona, misma_zona, full_name, diferencia
--     from public.buscar_pareja('quinta');
--
--   -- vacío sigue siendo correcto si: no has puesto tu lado, no tienes rating
--   -- en esa división, o tu RD todavía es alta (te estamos midiendo).
--   --
--   -- zona null en un candidato = todavía no se ha inscrito a ningún torneo.
-- ────────────────────────────────────────────────────────────
