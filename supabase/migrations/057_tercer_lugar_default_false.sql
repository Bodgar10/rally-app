-- ============================================================================
-- 057_tercer_lugar_default_false.sql  ·  RALLY
--
-- El partido por el 3.er lugar deja de crearse por defecto.
--
-- POR QUÉ CAMBIA
--   La 052 lo dejó en `true` para no alterar los torneos que ya estaban en
--   marcha, y esa razón sigue siendo válida — por eso aquí NO se tocan las
--   filas existentes. Lo que cambia es el default para los torneos NUEVOS: en
--   un torneo real no se juega. La gente ya jugó tres días, el domingo por la
--   tarde los dos perdedores de semifinal quieren irse a su casa, y el partido
--   se queda sin disputar o se juega a medias.
--
--   Quien lo quiera, lo enciende desde la pantalla de Formato.
--
-- LO QUE ARRASTRA
--   Ocho partidos menos en el último día de un torneo de ocho categorías, y en
--   el peor momento: la transición de semifinales a final, cuando las ocho
--   convergen. Medido contra Cimepa, el domingo pasa de acabar a las 19:00 a
--   las 18:30, y el planificador puede repescar a más gente con el mismo
--   margen de cierre.
--
-- POR QUÉ NO SE TOCAN LAS FILAS EXISTENTES
--   Un torneo en curso que ya contaba con su 3.er lugar se quedaría sin él a
--   media fase final, que es exactamente el daño que la 052 evitaba. Si se
--   quiere apagar en los que aún no han empezado, la consulta está al final,
--   comentada y acotada a `draft` y `registration_open`.
--
-- Aplicar DESPUÉS de 052. Idempotente.
-- ============================================================================

alter table public.tournaments
  alter column tercer_lugar set default false;

comment on column public.tournaments.tercer_lugar is
  'Si el torneo juega el partido por el 3.er lugar. Default FALSE desde la 057: '
  'en un torneo real no se juega, y los torneos anteriores a ese cambio '
  'conservan el true con el que se crearon. Lo consumen generate-bracket y '
  'record_knockout_result para decidir si lo crean, y el planificador y '
  'schedule-knockout para contarlo en el presupuesto del ultimo dia.';


-- ── Verificación ────────────────────────────────────────────────────────────
-- El default nuevo:
-- select column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'tournaments'
--    and column_name = 'tercer_lugar';
--
-- Cuántos torneos siguen con el 3.er lugar encendido, y en qué estado:
-- select status, count(*) from public.tournaments
--  where tercer_lugar group by status order by status;
--
-- OPCIONAL, y solo si se quiere apagar en los que todavia no empezaron.
-- NO se aplica automaticamente: es una decision de producto, no de esquema.
-- update public.tournaments
--    set tercer_lugar = false
--  where tercer_lugar
--    and status in ('draft', 'registration_open');
