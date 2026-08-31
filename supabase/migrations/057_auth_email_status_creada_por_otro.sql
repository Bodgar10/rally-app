-- ============================================================================
-- 057_auth_email_status_creada_por_otro.sql  ·  RALLY
--
-- LA MITAD DE CADA PAREJA SE QUEDABA FUERA
--   `auth_email_status` (043) devolvía 'has_password' para las cuentas que un
--   jugador crea a su compañero al inscribirse. El login le pedía entonces una
--   contraseña que esa cuenta nunca tuvo, y no había salida: "crear cuenta"
--   decía que el correo ya existe y "entrar" que las credenciales no valen.
--
--   No es un caso raro. Es el camino normal: `pair-register-self` crea al
--   compañero en CADA inscripción de pareja.
--
-- POR QUÉ NO LO CAZABA
--   La 043 tenía dos redes y las dos fallaron:
--
--   1. `nullif(encrypted_password,'') is null` → GoTrue NO deja ese campo
--      vacío al crear un usuario sin contraseña; guarda algo. La red no toca.
--
--   2. `created_by = 'organizer' and last_sign_in_at is null` → el cinturón de
--      seguridad que sí estaba pensado para esto, pero enumerando UN valor.
--      `pair-register-self` marca 'player', no 'organizer', así que pasaba de
--      largo.
--
-- LA REGLA, AL REVÉS
--   No se añade 'player' a una lista: la lista volvería a quedarse corta el día
--   que aparezca un cuarto origen. Se invierte la pregunta.
--
--     Una cuenta que NUNCA se ha usado y que NO creó su dueño necesita
--     activación.
--
--   `created_by` está ausente cuando la persona se registró ella misma, y solo
--   lleva valor cuando la creó otro ('organizer', 'player') o cuando ya se
--   activó ('self_activated', que pone `activate-account` DESPUÉS de poner
--   contraseña — esa sí la tiene y por eso es la única excepción).
--
--   Así, un 'import' o un 'admin' futuros caen del lado seguro sin que nadie
--   se acuerde de tocar esto.
--
-- POR QUÉ ES SEGURO
--   'needs_activation' no deja entrar a nadie: lleva a la pantalla de poner
--   contraseña, que sigue exigiendo el enlace por correo. Equivocarse hacia
--   'needs_activation' manda a alguien a un sitio donde no puede hacer daño;
--   equivocarse hacia 'has_password' —lo de hoy— lo deja fuera de la app.
--
-- Aplicar DESPUÉS de 043.
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

  -- LA REGLA GENERAL: nunca usada y no la creó su dueño.
  --
  -- `created_by` ausente = se registró ella misma. Con valor = la creó otro,
  -- salvo 'self_activated', que se pone justo DESPUÉS de que la persona ponga
  -- su contraseña: esa sí la tiene.
  if v_last is null
     and v_creador is not null
     and v_creador <> 'self_activated' then
    return 'needs_activation';
  end if;

  return 'has_password';
end;
$$;

comment on function public.auth_email_status(text) is
  'Estado de una cuenta para el login en dos pasos: not_found | '
  'needs_activation | has_password. Una cuenta que nunca se ha usado y que no '
  'creo su dueno (created_by con valor distinto de self_activated) necesita '
  'activacion: es el caso del companero que otro jugador da de alta al '
  'inscribir la pareja. Ver migracion 057; la enumeracion de correos esta '
  'discutida en la 043.';
