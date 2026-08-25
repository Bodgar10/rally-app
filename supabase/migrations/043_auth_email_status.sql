-- ============================================================================
-- 043_auth_email_status.sql  ·  RALLY
--
-- EL JUGADOR QUE NO PUEDE ENTRAR
--   El organizador da de alta a 24 personas y a una no le llega el correo —
--   spam, dominio mal escrito, Resend caído. Esa persona tiene cuenta en RALLY
--   pero NO tiene contraseña, así que:
--     · "Entrar" le dice "correo o contraseña incorrectos" (no tiene ninguna),
--     · "Crear cuenta" le dice que el correo ya está registrado.
--   Queda fuera sin ninguna salida. Hoy no hay forma de que entre.
--
--   Esta RPC parte el login en dos pasos: primero el correo, y según el estado
--   de la cuenta se le manda al sitio correcto. Al que nunca activó se le lleva
--   directo a poner contraseña, sin pedirle una que no tiene.
--
-- QUÉ DEVUELVE — Y NADA MÁS
--   Una de tres cadenas. Ni nombre, ni id, ni fecha, ni si es organizador.
--     'not_found'         no hay cuenta con ese correo
--     'needs_activation'  la creó un organizador y nunca se ha usado
--     'has_password'      cuenta normal: pedirle la contraseña
--
-- SOBRE LA ENUMERACIÓN DE CORREOS (leer antes de tocar esto)
--   Sí, esto permite averiguar si un correo está registrado en RALLY. Se acepta
--   a conciencia:
--
--   · Cualquier login del mundo lo revela igual. "Correo o contraseña
--     incorrectos" frente a "esta cuenta no existe" es la misma señal, y el
--     formulario de registro la da todavía más clara ("ese correo ya tiene
--     cuenta").
--   · Lo que se filtra es la EXISTENCIA de un correo que el atacante ya tenía
--     que conocer para preguntar. No se puede listar, ni recorrer, ni sacar un
--     correo que no se supiera de antes.
--   · No abre ninguna vía de acceso: 'needs_activation' lleva a la pantalla de
--     poner contraseña, que sigue exigiendo el enlace por correo. Saber el
--     estado no acerca a nadie a entrar.
--
--   DIFERENCIA REAL FRENTE AL LOGIN, y es la que importa: GoTrue limita los
--   intentos de login por IP; esta RPC no. Un script podría comprobar miles de
--   correos por minuto. Mitigación mínima ya incluida: normaliza y valida el
--   formato antes de consultar, y es STABLE (sin efectos). Si algún día
--   preocupa el volumen, lo correcto es rate limit en el edge, no quitar la
--   función — quitarla devolvería al jugador al callejón sin salida.
--
-- POR QUÉ SECURITY DEFINER Y GRANT A ANON
--   Lee `auth.users`, que ningún rol de cliente puede tocar. Y se llama ANTES
--   de iniciar sesión, así que quien la invoca es `anon` por definición.
--
-- Aplicar DESPUÉS de 037 (que es la que empezó a marcar created_by).
-- ============================================================================

create or replace function public.auth_email_status(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_pwd      text;
  v_last     timestamptz;
  v_creador  text;
begin
  -- Se valida el formato antes de tocar la tabla: sin esto, la función es un
  -- endpoint de consulta gratuito para cualquier cadena.
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return 'not_found';
  end if;

  select u.encrypted_password,
         u.last_sign_in_at,
         u.raw_user_meta_data ->> 'created_by'
    into v_pwd, v_last, v_creador
  from auth.users u
  where u.email = v_email
  limit 1;

  if not found then
    return 'not_found';
  end if;

  -- Sin contraseña no hay forma de entrar, venga de donde venga la cuenta.
  -- `nullif` porque GoTrue guarda cadena vacía en algunos caminos de alta.
  if nullif(v_pwd, '') is null then
    return 'needs_activation';
  end if;

  -- Cinturón y tirantes: alta por organizador que nunca se ha usado. Cubre el
  -- caso de que GoTrue rellene encrypted_password con algo no vacío al crear
  -- el usuario sin contraseña.
  if v_creador = 'organizer' and v_last is null then
    return 'needs_activation';
  end if;

  return 'has_password';
end;
$$;

comment on function public.auth_email_status(text) is
  'Estado de una cuenta para el login en dos pasos: not_found | '
  'needs_activation | has_password. Devuelve SOLO eso: ni nombre, ni id, ni '
  'fechas. Ejecutable por anon porque se llama antes de iniciar sesion. '
  'Permite saber si un correo existe, lo mismo que revela cualquier login; ver '
  'la nota de enumeracion en la migracion 043.';

revoke all     on function public.auth_email_status(text) from public;
grant  execute on function public.auth_email_status(text) to anon, authenticated;

-- ── Verificación (con la anon key, sin sesión) ──────────────────────────────
--   select public.auth_email_status('no-existe@x.com');   -- not_found
--   select public.auth_email_status('basura');            -- not_found
--   select public.auth_email_status('<tu-correo>');       -- has_password
