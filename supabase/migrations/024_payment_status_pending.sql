-- 024_payment_status_pending.sql
-- Sprint 4 · Pagos · estado "pending" para parejas que van a pagar online.
-- Antes: payment_status = {paid_online, paid_offline, comp}. El default de pairs era 'paid_offline',
-- lo que hacía que checkout-tournament rechazara cada pareja con 409 already_paid.
-- Ahora: se agrega 'pending' y pasa a ser el default de pairs (estado previo al cobro online).
--
-- ⚠️ POSTGRES: un valor de enum recién agregado NO puede usarse en la MISMA transacción.
--    El SQL Editor corre todo como una sola transacción, así que ESTE ARCHIVO SE APLICA EN 2 PASOS:
--    ejecuta primero el PASO 1 (solo), y cuando termine, ejecuta el PASO 2.
--    (Con `supabase db push` cada archivo es una transacción → si falla, divídelo en 024 y 025.)

-- ─────────────────────────────────────────────────────────────
-- PASO 1 — agregar el valor al enum (córrelo SOLO y deja que termine)
-- ─────────────────────────────────────────────────────────────
alter type public.payment_status add value if not exists 'pending';

-- ─────────────────────────────────────────────────────────────
-- PASO 2 — cambiar el default de pairs (córrelo DESPUÉS del PASO 1)
-- ─────────────────────────────────────────────────────────────
alter table public.pairs
  alter column payment_status set default 'pending';
