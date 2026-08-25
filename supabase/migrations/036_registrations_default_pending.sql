-- 036_registrations_default_pending.sql  ·  RALLY
--
-- QUÉ CAMBIA
--   registrations.payment_status:  default 'paid_offline'  →  default 'pending'
--
-- POR QUÉ
--   La 003 le puso default 'paid_offline' porque en aquel momento la única forma
--   de crear una inscripción era que el organizador la metiera a mano tras cobrar
--   en efectivo. Desde Stripe Connect (021/Sprint 4) eso ya no es cierto: la fila
--   la crea el webhook, siempre con payment_status explícito.
--
--   El default quedó huérfano, y es un default peligroso: una fila que se cuele
--   SIN especificar payment_status se contaría como ingreso cobrado. En un
--   sistema que reparte dinero entre organizador y plataforma, ese es el error
--   más caro posible — y silencioso, porque nadie revisa un pago que "ya está".
--
--   'pending' invierte el sesgo: si algún día un camino nuevo olvida el campo,
--   la fila no cuenta como pagada y alguien lo nota. Fallar por defecto hacia
--   "no cobrado" es recuperable; hacia "cobrado" no.
--
-- VERIFICADO ANTES DE ESCRIBIR ESTA MIGRACIÓN (2026-08-25)
--   1. Filas existentes en `registrations`: 0.
--      Consultado vía PostgREST con service_role (bypass de RLS). Ninguna fila
--      depende del default actual, así que el cambio no reinterpreta datos ya
--      guardados. No hace falta backfill.
--
--   2. Escrituras a `registrations` en todo el proyecto: 2, ambas en
--      supabase/functions/webhooks-stripe-connect/index.ts
--        · línea  66  .update({ payment_status: "comp" })          (charge.refunded)
--        · línea 104  .upsert({ ..., payment_status: "paid_online" }) (PI confirmado)
--      Las dos son EXPLÍCITAS. Ninguna Edge Function inserta sin el campo.
--
--   3. Inserts desde migraciones, triggers o RPC: ninguno.
--      El único trigger BEFORE INSERT es enforce_parental_consent (021), que
--      valida y devuelve NEW sin tocar payment_status.
--
--   4. Ningún código de cliente inserta en `registrations`.
--
-- EFECTO SECUNDARIO DESEABLE
--   La policy `registrations_insert_owner_offline` (021) exige
--     payment_status in ('paid_offline','comp')
--   Hoy, un insert de cliente que omitiera el campo pasaba la policy por el
--   default. A partir de ahora cae en 'pending' y la policy lo RECHAZA.
--   Eso es lo correcto: obliga a que el organizador declare cómo se cobró en vez
--   de heredarlo de un default. Si alguna pantalla futura inserta ahí, tiene que
--   mandar payment_status explícito — como ya hace el webhook.
--
-- LO QUE NO CAMBIA
--   · El enum `payment_status` ya incluye 'pending' (lo usa pairs desde la 024).
--     No hay que añadir ningún valor.
--   · Las filas existentes: cero, y de todos modos `set default` NO reescribe
--     filas. Solo afecta a inserts futuros que omitan la columna.
--   · La columna sigue siendo NOT NULL.
--   · pairs.payment_status ya tiene default 'pending' desde la 024. Con esto las
--     dos tablas quedan con el mismo sesgo por defecto.

alter table public.registrations
  alter column payment_status set default 'pending';

comment on column public.registrations.payment_status is
  'Estado de cobro de la inscripción. Default ''pending'' a propósito: quien inserta DEBE declarar cómo se cobró. Un default optimista contaría dinero que no entró. paid_online lo pone el webhook de Stripe; paid_offline lo declara el organizador (cobro fuera de la plataforma); comp = cortesía o reembolsada, no cuenta como ingreso.';

-- ── Verificación (correr después; debe devolver 'pending') ──────────────────
-- select column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name   = 'registrations'
--    and column_name  = 'payment_status';
