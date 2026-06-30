// Función dummy SOLO para validar que el bundle se importa y typechequea en Deno.
// No se despliega en producción. Verificación: `deno check` exit 0.
import {
  validateScore,
  computeStandings,
  computeClinch,
  computeSeeding,
  advanceBracket,
  thirdPlaceFromSemis,
} from '../_shared/engine.bundle.js';

Deno.serve(() => {
  const fns = [
    validateScore,
    computeStandings,
    computeClinch,
    computeSeeding,
    advanceBracket,
    thirdPlaceFromSemis,
  ];
  return new Response(JSON.stringify({ ok: fns.every((f) => typeof f === 'function') }), {
    headers: { 'content-type': 'application/json' },
  });
});
