-- 031_organizer_selfserve.sql  ·  RALLY
-- Alta de organizador en AUTOSERVICIO + verificación derivada.
--
-- POR QUÉ HACE FALTA SECURITY DEFINER
--   La RLS de 008 deja el autoservicio imposible desde el cliente:
--     · public.organizers        no tiene política de INSERT para authenticated.
--     · organizer_members tiene  orgmembers_owner_write con
--       `with check (public.is_org_owner(organizer_id))` — es decir, para
--       insertar tu PRIMERA membresía owner ya tendrías que ser owner.
--   Huevo y gallina. La única salida limpia es una función SECURITY DEFINER
--   que cree el tenant y su primera membresía de una sola vez, con la
--   autorización hecha dentro (auth.uid()) en vez de delegada a la RLS.
--
-- DIFERENCIA CON 011/014/015/016/018/026
--   Aquellas RPC reciben `p_actor` porque las invoca una Edge Function con
--   service_role (auth.uid() es NULL ahí). Ésta se llama DIRECTO desde el
--   cliente con el JWT del usuario, así que usa auth.uid() y no acepta actor
--   por parámetro: un `p_actor` aquí sería una suplantación de un solo salto.
--   Por eso el grant es a `authenticated` y NO a service_role.
--
-- DECISIONES DE PRODUCTO QUE FIJA ESTA MIGRACIÓN
--   · La verificación es DERIVADA (vista), no una columna materializada:
--     no puede desincronizarse porque no se almacena.
--   · Un usuario es owner de UN SOLO club por ahora. Si ya lo es, la RPC
--     devuelve el existente sin crear nada (idempotente).
--
-- Aplicar DESPUÉS de 001_initial_schema.sql y 008_auth_rls.sql.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. slugify(text) — normalización determinista de nombre a slug
--
--    Sin unaccent: el proyecto no crea NINGUNA extensión (verificado sobre
--    001–030), y en Supabase unaccent vive en el esquema `extensions`, fuera
--    del search_path que fijamos abajo. La traducción manual cubre el juego
--    de acentos del español (más ç y las variantes que suelen colarse por
--    copiar/pegar) y no añade dependencias.
--
--    IMMUTABLE porque lower/translate/regexp_replace/left lo son: eso permite
--    indexarla más adelante si hiciera falta buscar por slug normalizado.
-- ----------------------------------------------------------------------------

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select
    -- 4) recorte a 40 y limpieza del guion que pudo dejar el corte
    regexp_replace(
      left(
        -- 3) sin guiones en los extremos
        regexp_replace(
          -- 2) todo lo que no sea [a-z0-9] -> guion. El + ya colapsa repeticiones.
          regexp_replace(
            -- 1) minúsculas + acentos fuera
            translate(
              lower(p_text),
              'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
              'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
            ),
            '[^a-z0-9]+', '-', 'g'
          ),
          '^-+|-+$', '', 'g'
        ),
        40
      ),
      '-+$', '', 'g'
    );
$$;

comment on function public.slugify(text) is
  'Normaliza un texto a slug ASCII: minúsculas, sin acentos, [a-z0-9-], máx 40. '
  'Puede devolver cadena vacía si la entrada no tiene ningún alfanumérico; '
  'el fallback a un slug base lo aplica quien la llama (ver create_organizer).';


-- ----------------------------------------------------------------------------
-- 2. create_organizer(name, contact_email) — alta en autoservicio
--
--    Crea `organizers` + su primera `organizer_members` (owner) en la MISMA
--    transacción. Si el segundo INSERT falla, el primero se deshace solo: sin
--    esa atomicidad quedaría un tenant huérfano sin dueño, imposible de
--    reparar desde la app (nadie sería owner, así que nadie podría tocarlo).
--
--    search_path fijado explícitamente: en SECURITY DEFINER es obligatorio.
--    Sin él, un search_path manipulado por el llamador podría resolver
--    `organizers` a una tabla suya y la función escribiría donde no debe.
--    `auth.uid()` va calificado, así que no depende del search_path.
-- ----------------------------------------------------------------------------

create or replace function public.create_organizer(
  p_name          text,
  p_contact_email text
)
returns table (
  organizer_id    uuid,
  slug            text,
  already_existed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user          uuid := auth.uid();
  v_name          text;
  v_email         text;
  v_base          text;
  v_slug          text;
  v_org           uuid;
  v_existing_id   uuid;
  v_existing_slug text;
  v_intento       int;
begin
  -- 2.1) Sesión. Sin JWT no hay a quién asignarle el club.
  if v_user is null then
    raise exception 'unauthenticated'
      using detail = 'Necesitas iniciar sesión para crear un club.',
            errcode = '28000';
  end if;

  -- 2.2) Idempotencia: un owner, un club (decisión de producto).
  --      Protege del doble tap y del reintento de red: en vez de un segundo
  --      club fantasma, devuelve el que ya tiene.
  --      Columnas calificadas a propósito: `slug` también es un parámetro OUT
  --      de esta función y sin alias sería ambiguo.
  select om.organizer_id, o.slug
    into v_existing_id, v_existing_slug
  from public.organizer_members om
  join public.organizers o on o.id = om.organizer_id
  where om.user_id = v_user
    and om.member_role = 'owner'
  order by om.created_at asc
  limit 1;

  if v_existing_id is not null then
    return query select v_existing_id, v_existing_slug, true;
    return;
  end if;

  -- 2.3) Validación de entrada.
  --      El mensaje de la excepción es un código snake_case (patrón del
  --      proyecto, estable para el cliente); el texto humano va en DETAIL.
  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 3 or char_length(v_name) > 60 then
    raise exception 'invalid_name'
      using detail = 'El nombre del club debe tener entre 3 y 60 caracteres.',
            errcode = '22023';
  end if;

  v_email := lower(btrim(coalesce(p_contact_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email'
      using detail = 'El correo de contacto no tiene un formato válido.',
            errcode = '22023';
  end if;

  -- 2.4) Slug + INSERT con reintento sobre colisión.
  --
  --      NO se hace SELECT-then-INSERT a propósito: entre comprobar que el
  --      slug está libre e insertarlo cabe otra alta, y el UNIQUE saltaría
  --      igual. La única garantía real es la constraint, así que insertamos
  --      y dejamos que Postgres arbitre.
  --
  --      El bloque BEGIN/EXCEPTION abre una subtransacción (savepoint): eso
  --      es lo que permite capturar el 23505 y reintentar sin abortar toda
  --      la transacción.
  --
  --      Reintentar ante CUALQUIER unique_violation es seguro aquí porque
  --      `organizers` solo tiene dos constraints únicas: la PK (id, con
  --      gen_random_uuid — no colisiona en la práctica) y slug.
  v_base := public.slugify(v_name);
  if v_base is null or v_base = '' then
    v_base := 'club';  -- nombre sin alfanuméricos (p. ej. solo emojis)
  end if;

  for v_intento in 1..23 loop
    if v_intento = 1 then
      v_slug := v_base;
    elsif v_intento <= 20 then
      -- -2, -3 … -20. Recorte a 37 para que el sufijo quepa en los 40.
      v_slug := left(v_base, 37) || '-' || v_intento::text;
    else
      -- Cola patológica (20 clubes con el mismo nombre): sufijo aleatorio.
      -- md5+random en vez de gen_random_bytes: pgcrypto no está declarado en
      -- ninguna migración y vive fuera de este search_path.
      v_slug := left(v_base, 33) || '-' ||
                substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    end if;

    begin
      insert into public.organizers (name, slug, contact_email)
      values (v_name, v_slug, v_email)
      returning id into v_org;

      exit;  -- insertado: salimos del bucle
    exception when unique_violation then
      v_org := null;  -- slug ocupado: siguiente intento
    end;
  end loop;

  if v_org is null then
    raise exception 'slug_generation_failed'
      using detail = 'No se pudo generar un identificador único para el club.',
            errcode = '23505';
  end if;

  -- 2.5) Primera membresía owner. Misma transacción que el INSERT de arriba:
  --      si esto falla, el organizador creado se deshace con ella.
  insert into public.organizer_members (organizer_id, user_id, member_role)
  values (v_org, v_user, 'owner');

  return query select v_org, v_slug, false;
end;
$$;

comment on function public.create_organizer(text, text) is
  'Alta de organizador en autoservicio: crea el tenant y su primera membresía '
  'owner atómicamente para el usuario de auth.uid(). Idempotente: si el usuario '
  'ya es owner de un club, devuelve ese (already_existed = true) sin crear nada.';

-- Solo `authenticated`: la función se apoya en auth.uid(), así que llamarla
-- con service_role devolvería 'unauthenticated'. Granted a anon tampoco tiene
-- sentido — no hay usuario al que asignar el club.
revoke all     on function public.create_organizer(text, text) from public, anon, service_role;
grant  execute on function public.create_organizer(text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. organizers_public — superficie de lectura pública del organizador
--
--    POR QUÉ UNA VISTA Y NO UN JOIN DIRECTO
--    `organizers_select_member` de 008 solo deja leer la fila a los MIEMBROS
--    del tenant. Un jugador que mira la lista de torneos no es miembro de
--    nadie, así que hoy no puede ver ni el nombre del club. Esta vista abre
--    exactamente lo necesario (nombre, slug y dos booleanos) y deja fuera
--    contact_email, stripe_connect_account_id y application_fee_percent.
--
--    La vista se ejecuta con los privilegios de su OWNER (postgres), no del
--    invocador, y por eso puede saltarse la RLS de `organizers`. Es
--    deliberado: es el mecanismo que la hace pública. Se hace explícito abajo
--    con security_invoker = false.
--
--    `verified` es DERIVADO, nunca almacenado: se recalcula en cada lectura,
--    así que no puede quedar desincronizado. Contrapartida asumida — si
--    Stripe restringe la cuenta, el club deja de estar verificado al instante.
-- ----------------------------------------------------------------------------

drop view if exists public.organizers_public;

create view public.organizers_public as
select
  o.id,
  o.name,
  o.slug,

  -- Verificado = Stripe ya hizo KYC (connect_status 'active') Y el club ya
  -- llevó al menos un torneo hasta el final. 'finished' es el valor exacto
  -- del enum public.tournament_status (001) y el que escribe finish_tournament
  -- (026): verificado contra ambas, no asumido.
  (
    o.connect_status = 'active'
    and exists (
      select 1
      from public.tournaments t
      where t.organizer_id = o.id
        and t.status = 'finished'
    )
  ) as verified,

  -- Puede cobrar en línea = Connect activo. Es el MISMO criterio que aplica
  -- checkout-tournament antes de crear la sesión de pago (devuelve 409
  -- organizer_not_ready si no se cumple), para que la UI no prometa un cobro
  -- que el servidor va a rechazar.
  (o.connect_status = 'active') as can_charge_online

from public.organizers o
where o.active = true;

comment on view public.organizers_public is
  'Lectura pública del organizador para la vista de jugador: nombre, slug y '
  'estado de verificación derivado. No expone correo ni datos de Stripe.';

-- security_invoker = false es el DEFAULT en toda versión de Postgres (antes de
-- 15 las vistas siempre corrían como su owner), pero lo dejamos explícito: de
-- esto depende que la vista sea legible por quien no es miembro del tenant.
-- Guardado por versión porque la opción solo existe desde PG15.
do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.organizers_public set (security_invoker = false)';
  end if;
end;
$$;

grant select on public.organizers_public to authenticated, anon;
