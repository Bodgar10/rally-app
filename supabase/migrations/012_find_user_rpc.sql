-- 012_find_user_rpc.sql
-- RPC para búsqueda de usuario por correo.
-- Necesaria porque la RLS de public.users solo permite leer la propia fila.
-- Esta función corre SECURITY DEFINER (bypass de RLS controlado) y devuelve
-- mínimo: id, email, full_name, photo_url. Match exacto de correo. Requiere sesión activa.
-- Usada por: agregar-pareja.tsx (organizador), inscripcion/index.tsx (jugador).
-- NOTA: incluye photo_url porque la pantalla de inscripción muestra el avatar de la
--       pareja (PartnerResult). Es un campo de display no sensible.

CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE(
  id        uuid,
  email     text,
  full_name text,
  photo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar que el caller tiene sesión activa
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Búsqueda exacta por correo (no ILIKE — no es un directorio público)
  RETURN QUERY
    SELECT
      u.id,
      u.email::text,
      u.full_name::text,
      u.photo_url::text
    FROM public.users u
    WHERE u.email = lower(trim(p_email))
    LIMIT 1;
END;
$$;

-- Revocar acceso público por defecto y dar solo a authenticated
REVOKE ALL ON FUNCTION public.find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated;

COMMENT ON FUNCTION public.find_user_by_email IS
  'Busca un usuario por correo exacto. SECURITY DEFINER: bypass controlado de RLS. '
  'Devuelve solo id/email/full_name/photo_url. Requiere sesión. '
  'Usado por agregar-pareja (organizador) e inscripción (jugador).';
