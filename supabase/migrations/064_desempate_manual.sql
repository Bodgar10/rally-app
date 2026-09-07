-- 064_desempate_manual.sql  ·  RALLY
--
-- EL SORTEO DEL ORGANIZADOR
--
--   5a Varonil, grupo J: ciclo perfecto de tres. Las tres parejas con 2
--   puntos, y ni los sets ni los games las separan. `computeStandings` lo marca
--   con `empateSinResolver` y `computeClinch` deja a las tres en 'alive', que
--   es la respuesta honesta: sin saber quien es primero, no se puede afirmar
--   que nadie clasifico.
--
--   Pero `position` dice 1, 2 y 3, y ese orden sale del desempate tecnico por
--   `pairId` que `selectQualifiers` necesita para tener un orden total. Si se
--   siembra asi, el primero del grupo lo elige un UUID.
--
--   La salida es el sorteo, y hasta ahora no existia: el organizador veia el
--   problema y no tenia con que resolverlo.
--
-- POR QUE UNA COLUMNA PROPIA Y NO `position`
--   `record_match_result` reescribe `position` en CADA captura, con lo que
--   diga el motor. Un orden sorteado guardado ahi duraria hasta el siguiente
--   resultado del grupo.
--
-- SE LIMPIA SOLA, SIN TOCAR NINGUNA RPC
--   El motor solo aplica este orden a un bloque que sigue siendo un empate
--   irresoluble Y cuyas parejas son exactamente las que tienen valor. Si un
--   resultado se corrige y el empate desaparece o cambia de miembros, el dato
--   deja de aplicarse por si mismo. No hace falta que nadie lo borre, y un
--   valor escrito por error no puede reordenar una tabla que si esta decidida.

alter table public.group_standings
  add column if not exists desempate_manual int;

alter table public.group_standings
  drop constraint if exists group_standings_desempate_manual_ck;
alter table public.group_standings
  add constraint group_standings_desempate_manual_ck
  check (desempate_manual is null or desempate_manual >= 1);

comment on column public.group_standings.desempate_manual is
  'Orden que el organizador sorteo entre parejas empatadas sin desempate posible. '
  '1 = primera del bloque. NULL = sin sorteo. Solo lo aplica el motor cuando el bloque '
  'sigue siendo un empate irresoluble con exactamente esas parejas; si el empate '
  'desaparece o cambia, el valor se ignora. No lo toca record_match_result.';
