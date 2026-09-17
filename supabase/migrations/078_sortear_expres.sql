-- 078_sortear_expres.sql  ·  RALLY
--
-- LA FUNCIÓN SE LLAMABA MAL: sembrar_expres → sortear_expres
--
--   La 077 la creó como `sembrar_expres`, y está mal por dos motivos.
--
--   EL PRIMERO ES QUE NO ES LO QUE HACE
--     "Sembrar" es colocar a los cabezas de serie en un cuadro para que no se
--     crucen antes de tiempo: hay un criterio deportivo detrás. En un exprés
--     los grupos se SORTEAN — el reparto A/B es aleatorio y no mira el nivel
--     de nadie. Llamarlo sembrar describe una operación que no ocurre.
--
--   EL SEGUNDO ES QUE "SEMBRAR" NO SE DICE EN MÉXICO
--     Es terminología traducida del inglés, y el proyecto tiene un test
--     (src/lib/__tests__/vocabulario-visible.test.ts) que barre `app/` y
--     `src/` buscando la palabra. Al regenerar los tipos, `sembrar_expres`
--     apareció en database.types.ts y el barrido lo cazó.
--
--     Se podía haber añadido una excepción a la lista, porque un nombre de RPC
--     en un archivo generado nunca se pinta. Pero esa lista es corta a
--     propósito —cada entrada es un acto deliberado— y gastarla en un nombre
--     que ADEMÁS es inexacto habría sido pagar dos veces.
--
--   Y encima deja el nombre junto a su vecino natural: `sortear_desempate`
--   (065), que hace lo mismo un paso después — guardar una decisión sobre
--   quién va dónde.
--
-- SE RENOMBRA, NO SE RECREA
--   `alter function ... rename to` conserva permisos, comentario y cuerpo. Un
--   drop + create volvería a exponer la función a `authenticated` durante el
--   hueco, y habría que acordarse de revocar otra vez.
--
-- ES GRATIS AHORA Y CARO EN UNA SEMANA
--   Todavía no la llama nadie: las Edge Functions del exprés no existen. Este
--   es el único momento en que renombrarla no cuesta nada.

begin;

alter function public.sembrar_expres(uuid, uuid, jsonb, jsonb)
  rename to sortear_expres;

comment on function public.sortear_expres(uuid, uuid, jsonb, jsonb) is
  'Sortea un exprés entero —grupos, reparto, tabla a cero y calendario— en una '
  'sola transacción. El reparto llega calculado por generarFixtureExpres a '
  'partir de la semilla guardada; aquí solo se comprueba que cuadra y se '
  'escribe. Se sortea una vez: expres_config.sorteado_at es el candado.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte)
--
--   select proname, pg_get_function_identity_arguments(oid)
--     from pg_proc where proname in ('sembrar_expres', 'sortear_expres');
--   -- debe salir SOLO sortear_expres
--
--   select has_function_privilege('authenticated',
--     'public.sortear_expres(uuid,uuid,jsonb,jsonb)', 'execute');
--   -- false: el revoke de la 077 sobrevive al rename
-- ────────────────────────────────────────────────────────────
