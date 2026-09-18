-- 082_buscar_pareja.sql  ·  RALLY
--
-- ENCONTRAR CON QUIÉN JUGAR
--
-- EL PROBLEMA QUE RESUELVE ES EL PRIMERO QUE TIENE UN JUGADOR
--
--   No es saber su estadística: es conseguir pareja. Hoy eso se resuelve en
--   un grupo de WhatsApp preguntando a ciegas —"¿alguien para el domingo?"— sin
--   saber de qué lado juega nadie ni si son del mismo nivel.
--
--   Con `preferred_side`, `mano` (migración 081) y el Glicko que ya se calcula,
--   RALLY puede contestar eso de verdad.
--
-- QUÉ ES SER COMPATIBLE
--
--   · DEL LADO CONTRARIO. Dos de drive no son pareja: uno jugaría fuera de su
--     sitio todo el partido. Quien juega 'ambos' encaja con cualquiera, y por
--     eso aparece para todos.
--   · DE NIVEL PARECIDO. Una pareja muy descompensada no es divertida para
--     ninguno de los dos. Se limita la diferencia de rating y se ordena por
--     cercanía: el más parecido primero.
--   · MEDIDO. Sin rating fiable no se puede afirmar que sean de nivel
--     parecido, así que no se sugiere — antes que sugerir a ciegas, no
--     sugerir.
--
-- ► NO DEVUELVE CORREOS, Y ESO ES A PROPÓSITO
--
--   Esto es una lista de gente que el jugador no buscó por nombre: convertirla
--   en un directorio con correos sería regalar una base de datos cosechable.
--   Devuelve quién es, de qué lado juega y su nivel. Para invitarlo se usa
--   `search_users`, que ya existe, pide teclear el nombre y enmascara el
--   correo — o sea que hay que saber a quién se busca.

begin;

create or replace function public.buscar_pareja(
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
  diferencia numeric
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

  return query
    select
      u.id,
      u.full_name::text,
      u.photo_url::text,
      pr.rating,
      pr.rd,
      u.preferred_side,
      u.mano,
      abs(pr.rating - v_rating) as diferencia
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
    order by abs(pr.rating - v_rating), u.full_name
    limit greatest(least(coalesce(p_limite, 10), 25), 1);
end;
$$;

revoke all     on function public.buscar_pareja(public.division, int) from public, anon;
grant  execute on function public.buscar_pareja(public.division, int) to authenticated;

comment on function public.buscar_pareja(public.division, int) is
  'Jugadores compatibles para hacer pareja: lado contrario y nivel parecido '
  '(±150 de rating, ambos medidos con RD < 100). SECURITY DEFINER porque la '
  'RLS de users solo deja ver la propia fila. NO devuelve correos: es una '
  'lista que el jugador no buscó por nombre, y con correos sería un directorio '
  'cosechable. Para invitar a alguien se usa search_users.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte, autenticado)
--
--   select * from public.buscar_pareja('cuarta');
--
--   -- vacío es correcto si: no has puesto tu lado, no tienes rating en esa
--   -- división, o tu RD todavía es alta (te estamos midiendo).
-- ────────────────────────────────────────────────────────────
