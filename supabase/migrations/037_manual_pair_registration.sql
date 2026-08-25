-- ============================================================================
-- 037_manual_pair_registration.sql  ·  RALLY
--
-- Habilita que el ORGANIZADOR dé de alta jugadores que todavía no tienen
-- cuenta, al registrar una pareja a mano. Hasta hoy los dos jugadores debían
-- existir ya en public.users, lo que obligaba a que 24 personas se registraran
-- antes del torneo.
--
-- EL CASO DEL MENOR DE EDAD
--   Un chico de 15 años no gestiona su cuenta ni lee términos legales: va con
--   su familia al club y el padre o la madre resuelve con el organizador ahí
--   mismo. Por eso una cuenta de menor se crea con el correo del TUTOR y el
--   NOMBRE del jugador (que es quien aparece en el cuadro y en el ranking).
--   El tutor activa la cuenta, pone la contraseña y acepta los términos; en
--   ese momento se registra parental_consent_at. No hay pantalla aparte de
--   consentimiento ni segundo enlace.
--
-- CINCO BLOQUES:
--   1. handle_new_user v3        — phone, parent_email y tos_version
--   2. search_users v2           — añade exact_email_match
--   3. player_age_declarations   — qué declaró el organizador sobre la edad
--   4. Blindaje de las columnas de tutela + RPC de activación
--   5. email_outbox              — qué correo salió, cuál falló, reenvío
--
-- Aplicar DESPUÉS de 001, 006, 008, 012, 021 y 034.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. handle_new_user v3
--
--    QUÉ AÑADE
--      · phone        — la columna existe desde la 001 y NINGÚN flujo la
--                       escribía. El alta por organizador es su primer escritor.
--      · parent_email — marca de "esta cuenta tiene tutor". Ver bloque 4.
--      · tos_accepted_version / tos_accepted_at — ver el bug de abajo.
--
--    BUG QUE ARREGLA DE PASO (preexistente, ajeno a este lote)
--      La migración 006 escribía tos_accepted_version leyendo
--      raw_user_meta_data->>'tos_version'. La 008 redefinió la función y DEJÓ
--      FUERA esas dos columnas sin querer. Mientras tanto
--      app/(auth)/registro.tsx:83 nunca dejó de mandar `tos_version` en el
--      metadata — verificado: CURRENT_TOS_VERSION = EXPO_PUBLIC_TOS_VERSION
--      ?? '1.0.0', y hoy vale '1.0.0'.
--      Resultado: desde la 008, la aceptación de términos NO se está
--      registrando en ninguna parte. Se restaura el comportamiento de la 006.
--
--      No se hace backfill de los usuarios ya creados: no sabemos qué versión
--      aceptaron ni cuándo, e inventar un timestamp en una columna legal es
--      peor que dejarla nula.
--
--    El alta por organizador manda tos_version = NULL a propósito: nadie ha
--    aceptado nada todavía. Se acepta al activar la cuenta (bloque 4).
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id, email, full_name, phone, role,
    parent_email,
    tos_accepted_version, tos_accepted_at
  )
  values (
    new.id,
    new.email,
    -- users.full_name es NOT NULL en la BD: garantizamos un valor no nulo.
    -- En el registro de hoy (correo+contraseña+nombre) el nombre viene en
    -- metadata; el resto es fallback defensivo (OAuth/magic-link sin nombre).
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Jugador'
    ),
    -- Las columnas nullable guardan NULL, no cadena vacía.
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    'player',
    -- En una cuenta de menor vale lo MISMO que email: el correo capturado es
    -- el del tutor y es a la vez la credencial de acceso y el contacto legal.
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'parent_email', '')), ''),
    nullif(new.raw_user_meta_data ->> 'tos_version', ''),
    -- El timestamp solo tiene sentido si hubo versión que aceptar.
    case
      when nullif(new.raw_user_meta_data ->> 'tos_version', '') is not null
      then now()
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea la fila en public.users al insertarse una en auth.users. Lee full_name, '
  'phone, parent_email y tos_version del raw_user_meta_data. Se dispara igual '
  'con auth.admin.createUser(), que es como el organizador da de alta jugadores.';

-- El trigger ya existe desde la 008 y apunta a esta función por nombre, así que
-- CREATE OR REPLACE basta. Se recrea igualmente por idempotencia.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 2. search_users v2 — añade exact_email_match
--
--    POR QUÉ
--      La 034 devuelve el correo ENMASCARADO ('jua***@gmail.com') para que la
--      búsqueda no sea un directorio cosechable. Ese enmascarado es correcto y
--      NO se toca.
--      Pero al registrar una pareja el organizador tiene el correo completo en
--      la mano y necesita confirmar que la persona que ve es esa. Con la
--      máscara solo puede comparar dominio y tres letras.
--      La función YA ordenaba poniendo primero la coincidencia exacta, pero no
--      lo decía. Ahora lo expone para que la UI pueda marcarlo.
--
--    No debilita el enmascarado: confirma algo que el organizador YA sabe
--    (escribió el correo). No revela ningún correo que no tuviera.
--
--    Se hace DROP porque cambia el tipo de retorno y CREATE OR REPLACE no
--    puede con eso.
-- ----------------------------------------------------------------------------

drop function if exists public.search_users(text);

create function public.search_users(p_query text)
returns table(
  id                 uuid,
  email              text,   -- ENMASCARADO. Ver cabecera de la 034.
  full_name          text,
  photo_url          text,
  exact_email_match  boolean
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
      u.photo_url::text,
      (public.unaccent_lower(u.email) = v_q) as exact_email_match
    from public.users u
    where public.unaccent_lower(u.full_name) like '%' || v_q || '%'
       or public.unaccent_lower(u.email)     like '%' || v_q || '%'
    order by
      (public.unaccent_lower(u.email) = v_q) desc,
      (public.unaccent_lower(u.full_name) like v_q || '%') desc,
      u.full_name
    limit 8;
end;
$$;

comment on function public.search_users(text) is
  'Busca jugadores por nombre o correo (parcial, sin acentos). Mínimo 3 '
  'caracteres, máximo 8 resultados. SECURITY DEFINER porque la RLS de users '
  'solo deja ver la propia fila. Devuelve el correo ENMASCARADO para no '
  'convertirlo en un directorio cosechable. exact_email_match dice si la '
  'consulta era el correo completo de esa persona.';

revoke all     on function public.search_users(text) from public, anon;
grant  execute on function public.search_users(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. player_age_declarations — qué declaró el organizador sobre la edad
--
--    POR QUÉ SE GUARDAN LAS DOS RESPUESTAS, NO SOLO "ES MENOR"
--      Si solo se registrara el caso del menor, no marcar la casilla sería
--      AUSENCIA de dato — indistinguible de "nadie preguntó". Guardando
--      también el "no es menor" queda constancia de que al organizador se le
--      preguntó y respondió, con su id y la hora.
--      Es lo que hace real el traspaso de responsabilidad: el organizador
--      tiene a la familia enfrente, y su declaración queda firmada.
--
--    POR QUÉ UNA TABLA Y NO UNA COLUMNA EN users
--      Es una afirmación que un TERCERO hace sobre una persona, en un momento
--      y un contexto concretos. Una columna en users guardaría solo la última
--      y perdería quién la hizo y para qué torneo. Como registro legal tiene
--      que ser append-only y llevar su contexto encima.
--      Por eso tampoco va en user_metadata: ahí no hay RLS ni FK, y además el
--      propio usuario puede reescribirlo con auth.updateUser().
--
--    POR QUÉ SE DUPLICA EL CORREO DEL ORGANIZADOR
--      declared_by es `on delete set null`: si algún día se borra su cuenta, el
--      registro legal NO debe desaparecer con ella. El correo se guarda como
--      instantánea de texto para que el rastro siga siendo legible sin la fila
--      original. Denormalización deliberada.
-- ----------------------------------------------------------------------------

create table if not exists public.player_age_declarations (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),

  -- Sobre quién se declara.
  user_id            uuid not null references public.users(id) on delete cascade,

  -- La respuesta. Se guardan AMBAS: ver nota arriba.
  declared_minor     boolean not null,

  -- Quién lo declara. Ver nota de denormalización.
  declared_by        uuid references public.users(id) on delete set null,
  declared_by_email  text not null,

  -- En qué contexto. Nullable: el torneo puede borrarse y la declaración vive.
  tournament_id      uuid references public.tournaments(id) on delete set null,

  -- Texto exacto que se le mostró al organizador. Si la copia cambia, los
  -- registros viejos siguen diciendo qué se aceptó en su momento.
  statement          text not null
);

create index if not exists player_age_declarations_user_idx
  on public.player_age_declarations(user_id);
create index if not exists player_age_declarations_by_idx
  on public.player_age_declarations(declared_by);

comment on table public.player_age_declarations is
  'Registro append-only de lo que el organizador declaró sobre la edad de un '
  'jugador al darlo de alta. Guarda las dos respuestas para que "no es menor" '
  'sea un dato y no una ausencia. NO bloquea inscripciones: es rastro '
  'auditable.';

alter table public.player_age_declarations enable row level security;

-- Lectura: quien la hizo y el propio jugador declarado. Nadie más.
drop policy if exists player_age_declarations_select on public.player_age_declarations;
create policy player_age_declarations_select on public.player_age_declarations
for select to authenticated
using (
  public.is_admin()
  or declared_by = auth.uid()
  or user_id     = auth.uid()
);

-- Sin policies de INSERT/UPDATE/DELETE a propósito: append-only y solo desde la
-- Edge Function con service_role, que las ignora. Un cliente no puede fabricar
-- ni retocar una declaración legal.


-- ----------------------------------------------------------------------------
-- 4. TUTELA: blindaje de columnas + RPC de activación
--
--    EL PROBLEMA
--      `users_update_own` (migración 008) deja que cualquiera actualice su
--      propia fila. Sin blindaje, el titular de una cuenta de menor podría
--      hacer `update users set parent_email = null` y la pantalla de
--      activación dejaría de pedir el consentimiento del tutor. Y peor:
--      podría escribirse `parental_consent_at = now()` a sí mismo.
--      Un consentimiento parental que el propio menor puede firmar no es un
--      consentimiento parental.
--
--    LA SOLUCIÓN
--      Mismo patrón que prevent_role_escalation, que ya existe desde la 008:
--      un trigger BEFORE UPDATE que congela esas columnas frente al cliente.
--      service_role y postgres (auth.uid() null) no se ven afectados, que es
--      como las escriben la Edge Function de alta y la RPC de abajo.
--
--    CÓMO SABE LA PANTALLA DE ACTIVACIÓN QUE ES UNA CUENTA DE MENOR
--      Leyendo su propia fila: `parent_email is not null`. No hace falta
--      columna nueva — esa columna YA significa exactamente eso — y la RLS
--      users_select_own ya permite leerla. Con el trigger de abajo, además, el
--      cliente no puede falsearla.
-- ----------------------------------------------------------------------------

create or replace function public.prevent_guardian_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.parent_email is distinct from old.parent_email then
      raise exception 'No autorizado: no puedes cambiar el correo del tutor.'
        using errcode = '42501';
    end if;
    if new.parental_consent_at is distinct from old.parental_consent_at then
      raise exception 'No autorizado: el consentimiento parental se registra al activar la cuenta.'
        using errcode = '42501';
    end if;
    if new.parental_consent_ip is distinct from old.parental_consent_ip then
      raise exception 'No autorizado: no puedes cambiar el registro de consentimiento.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.prevent_guardian_tampering() is
  'Congela parent_email y parental_consent_* frente a UPDATE de cliente. Sin '
  'esto, el titular de una cuenta de menor podría borrar la marca de tutela o '
  'auto-firmarse el consentimiento parental.';

drop trigger if exists users_prevent_guardian_tampering on public.users;
create trigger users_prevent_guardian_tampering
  before update on public.users
  for each row execute function public.prevent_guardian_tampering();


-- RPC de activación: la usa la pantalla de poner contraseña.
--
-- UNA SOLA FUNCIÓN PARA LOS DOS CASOS, y la rama la decide la BASE, no el
-- cliente: si la fila tiene parent_email, es cuenta de menor y exige el nombre
-- del tutor + registra parental_consent_at. Si no, solo registra los términos.
-- Si el cliente pudiera elegir la rama, podría saltarse el consentimiento
-- diciendo que no es menor.
create or replace function public.accept_terms_on_activation(
  p_tos_version text,
  p_parent_name text default null
)
returns table(
  is_minor_account boolean,
  consent_recorded boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := auth.uid();
  v_parent_email text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_tos_version, '')), '') is null then
    raise exception 'invalid_tos_version' using errcode = '22023';
  end if;

  select u.parent_email
    into v_parent_email
  from public.users u
  where u.id = v_uid;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_parent_email is not null then
    -- Cuenta de menor: el tutor firma, y firma con su nombre.
    if nullif(btrim(coalesce(p_parent_name, '')), '') is null then
      raise exception 'parent_name_required' using errcode = '22023';
    end if;

    update public.users u
       set parent_name          = btrim(p_parent_name),
           tos_accepted_version = p_tos_version,
           tos_accepted_at      = now(),
           -- coalesce: si ya se había firmado, no se re-fecha. El primer
           -- consentimiento es el que vale.
           parental_consent_at  = coalesce(u.parental_consent_at, now())
     where u.id = v_uid;

    return query select true, true;
  else
    update public.users u
       set tos_accepted_version = p_tos_version,
           tos_accepted_at      = now()
     where u.id = v_uid;

    return query select false, false;
  end if;
end;
$$;

comment on function public.accept_terms_on_activation(text, text) is
  'Registra la aceptación de términos al activar la cuenta. Si la fila tiene '
  'parent_email, exige el nombre del tutor y sella parental_consent_at. La '
  'rama la decide la base, nunca el cliente. parental_consent_ip queda NULL: '
  'inet_client_addr() a través del pooler devuelve la IP del pooler, no la '
  'del tutor, y un dato falso es peor que ninguno.';

revoke all     on function public.accept_terms_on_activation(text, text) from public, anon;
grant  execute on function public.accept_terms_on_activation(text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. email_outbox — trazabilidad y reenvío
--
--    POR QUÉ EXISTE
--      Los correos salen DESPUÉS del commit y no bloquean la respuesta: si
--      Resend falla, la pareja ya quedó inscrita y eso es lo que importa. Pero
--      entonces hace falta que alguien pueda ver que ese correo no salió y
--      reenviarlo. Sin esta tabla, el fallo es invisible.
--
--    POR QUÉ CHECK Y NO ENUM
--      `kind` y `status` son infraestructura de envío, no conceptos del
--      dominio del padel. Los enums del proyecto (payment_status, division…)
--      modelan reglas de negocio. Un CHECK se amplía con un ALTER normal; un
--      enum arrastra ceremonia para añadir un valor.
-- ----------------------------------------------------------------------------

create table if not exists public.email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  -- Cuatro tipos, y la distinción menor/adulto NO es cosmética: en una cuenta
  -- de menor quien lee es el TUTOR, así que el correo habla del jugador en
  -- tercera persona. Un menor ya inscrito antes vuelve a inscribirse alguna
  -- vez, y ahí 'registered' le diría "Hola, Diego" al buzón del padre.
  kind                text not null
    check (kind in (
      'account_created',        -- cuenta nueva de adulto  → al jugador
      'minor_account_created',  -- cuenta nueva de menor   → al TUTOR
      'registered',             -- adulto ya con cuenta    → al jugador
      'minor_registered'        -- menor ya con cuenta     → al TUTOR
    )),

  -- Destinatario. to_email se guarda literal: si el usuario cambia de correo
  -- después, seguimos sabiendo a dónde se mandó de verdad. En una cuenta de
  -- menor es el correo del tutor.
  to_email            text not null,
  to_user_id          uuid references public.users(id) on delete set null,

  -- Contexto para poder reconstruir el correo al reenviarlo.
  tournament_id       uuid references public.tournaments(id) on delete cascade,
  pair_id             uuid references public.pairs(id) on delete cascade,
  payload             jsonb not null default '{}'::jsonb,

  status              text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempts            int  not null default 0,
  last_error          text,
  sent_at             timestamptz,
  provider_message_id text
);

create index if not exists email_outbox_tournament_idx
  on public.email_outbox(tournament_id);
create index if not exists email_outbox_pair_idx
  on public.email_outbox(pair_id);
-- Parcial: la consulta que importa es "¿qué quedó sin salir?", y los enviados
-- serán la inmensa mayoría de las filas.
create index if not exists email_outbox_pendientes_idx
  on public.email_outbox(status) where status <> 'sent';

comment on table public.email_outbox is
  'Registro de correos transaccionales: qué salió, qué falló y con qué error. '
  'La escribe SOLO la Edge Function con service_role. El organizador la lee '
  'para ver fallos y pedir reenvío.';

alter table public.email_outbox enable row level security;

-- Lectura: el owner del organizador dueño del torneo, y admin.
-- tournament_org() e is_org_owner() son helpers SECURITY DEFINER de la 008.
drop policy if exists email_outbox_select_owner on public.email_outbox;
create policy email_outbox_select_owner on public.email_outbox
for select to authenticated
using (
  public.is_admin()
  or (
    tournament_id is not null
    and public.is_org_owner(public.tournament_org(tournament_id))
  )
);

-- Sin INSERT/UPDATE/DELETE desde cliente: el reenvío pasa por la Edge Function
-- `email-resend`, que revalida la propiedad del torneo. Si el cliente pudiera
-- escribir aquí, podría marcar como 'sent' algo que nunca salió.


-- ── Verificación (correr después) ───────────────────────────────────────────
-- select proname from pg_proc
--  where proname in ('handle_new_user','search_users',
--                    'prevent_guardian_tampering','accept_terms_on_activation');
-- select count(*) from public.player_age_declarations;  -- 0
-- select count(*) from public.email_outbox;             -- 0
-- select * from public.search_users('rally');           -- 5 columnas
