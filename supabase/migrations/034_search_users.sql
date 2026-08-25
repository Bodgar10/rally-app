-- 034_search_users.sql  ·  RALLY
-- Búsqueda de jugadores por nombre O correo, para asignar jueces.
--
-- POR QUÉ SECURITY DEFINER (no es opcional)
--   La RLS de `public.users` deja que cada quien lea SOLO su propia fila
--   (`users_select_own`: id = auth.uid()). Verificado contra la base real: con
--   un JWT de usuario, `select count(*) from users` devuelve 1 de 2 filas.
--   Una búsqueda hecha desde el cliente devolvería siempre esa única fila.
--   La función tiene que saltarse la RLS de forma controlada, igual que ya hace
--   find_user_by_email.
--
-- POR QUÉ EL CORREO VA ENMASCARADO
--   La búsqueda exacta original era exacta A PROPÓSITO — su comentario decía
--   "no ILIKE — no es un directorio público". Al abrirla a coincidencia
--   parcial, devolver el correo completo convertiría esto en un endpoint de
--   cosecha: cualquier usuario teclea 'a', 'e', 'o'… y extrae nombre + correo
--   de toda la base, de 8 en 8.
--   Se puede seguir BUSCANDO por correo (la comparación usa el valor real en
--   el servidor), pero lo que sale es 'ern***@correo.com'. Suficiente para
--   desempatar homónimos, inútil para cosechar.
--
-- SIN ÍNDICE, A PROPÓSITO
--   `like '%erne%'` lleva comodín inicial, así que ningún B-tree lo puede
--   servir. El índice que serviría es GIN con pg_trgm, y eso significaría la
--   PRIMERA extensión del proyecto — en Supabase vive en el esquema
--   `extensions`, fuera del search_path de estas funciones, con el mismo
--   tropiezo que dio unaccent al escribir slugify (migración 031).
--   Con 2 usuarios hoy, el seq scan son microsegundos.
--
--   ► MEDIR cuando `select count(*) from public.users` pase de ~10.000.
--     A partir de ahí toca pg_trgm + GIN sobre unaccent_lower(full_name),
--     recordando meter `extensions` en el search_path de la función.
--
-- Aplicar DESPUÉS de 001, 008 y 012.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Normalizador: minúsculas y sin acentos, sin extensiones.
--    Mismo juego de caracteres y mismo motivo que public.slugify (031).
-- ----------------------------------------------------------------------------

create or replace function public.unaccent_lower(t text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select translate(
    lower(t),
    'áàäâãéèëêíìïîóòöôõúùüûñç',
    'aaaaaeeeeiiiiooooouuuunc'
  );
$$;

comment on function public.unaccent_lower(text) is
  'Minúsculas + sin acentos, sin depender de la extensión unaccent. '
  'IMMUTABLE para poder indexarla el día que haga falta pg_trgm.';


-- ----------------------------------------------------------------------------
-- 2. search_users — nombre O correo, parcial, insensible a mayúsculas y acentos
-- ----------------------------------------------------------------------------

create or replace function public.search_users(p_query text)
returns table(
  id         uuid,
  email      text,   -- ENMASCARADO. Ver cabecera.
  full_name  text,
  photo_url  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_q := public.unaccent_lower(btrim(coalesce(p_query, '')));

  -- Menos de 3 caracteres devuelve vacío, no error: teclear dos letras es un
  -- estado normal de la escritura, no un fallo que haya que reportar.
  if length(v_q) < 3 then
    return;
  end if;

  return query
    select
      u.id,
      -- 'ernesto@correo.com' -> 'ern***@correo.com'. Se parte por '@' ANTES de
      -- recortar: con left(email,3) un correo corto filtraría el dominio.
      (left(split_part(u.email, '@', 1), 3) || '***@' || split_part(u.email, '@', 2))::text,
      u.full_name::text,
      u.photo_url::text
    from public.users u
    where public.unaccent_lower(u.full_name) like '%' || v_q || '%'
       or public.unaccent_lower(u.email)     like '%' || v_q || '%'
    order by
      -- 1) correo exacto: quien teclea el correo entero sabe a quién busca
      (public.unaccent_lower(u.email) = v_q) desc,
      -- 2) prefijo del nombre: 'erne' antes que quien lo lleve en medio
      (public.unaccent_lower(u.full_name) like v_q || '%') desc,
      u.full_name
    limit 8;
end;
$$;

comment on function public.search_users(text) is
  'Busca jugadores por nombre o correo (parcial, sin acentos). Mínimo 3 '
  'caracteres, máximo 8 resultados. SECURITY DEFINER porque la RLS de users '
  'solo deja ver la propia fila. Devuelve el correo ENMASCARADO para no '
  'convertirlo en un directorio cosechable.';

revoke all     on function public.search_users(text) from public, anon;
grant  execute on function public.search_users(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. Arreglo de drift: find_user_by_email es ejecutable por `anon`
--
--    La migración 012 hizo `REVOKE ALL ... FROM PUBLIC` y concedió solo a
--    authenticated, pero en la base real no quedó así. Comprobado llamando
--    ambas RPC con la anon key:
--
--      create_organizer     -> permission denied for function   (correcto)
--      find_user_by_email   -> not_authenticated                (se EJECUTÓ)
--
--    El segundo mensaje es la excepción interna de la propia función, o sea
--    que anon llegó a entrar. Hoy lo salva su guard `auth.uid() is null`, pero
--    el permiso no debería estar ahí. Se revoca explícitamente de anon.
-- ----------------------------------------------------------------------------

revoke all     on function public.find_user_by_email(text) from public, anon;
grant  execute on function public.find_user_by_email(text) to authenticated;
