// Función dummy SOLO para validar que el bundle se importa y typechequea en Deno.
// No se despliega en producción. Verificación: `deno check` exit 0.
//
// EL EXPRÉS SE COMPRUEBA LLAMÁNDOLO, NO MIRANDO SI EXISTE
//   Para el resto basta con `typeof f === 'function'`, porque esas funciones
//   llevan tiempo y sus firmas no se mueven. Las del exprés son nuevas y las
//   consumen dos Edge Functions que aquí no se pueden typechequear —la
//   resolución de node_modules de Deno no encuentra supabase-js en este
//   entorno—. Así que se las llama con argumentos reales: si una firma cambia
//   en TypeScript y el bundle se queda viejo, o si los tipos del .d.ts no
//   cuadran con el uso, esto deja de compilar.
import {
  validateScore,
  computeStandings,
  computeClinch,
  computeSeeding,
  advanceBracket,
  thirdPlaceFromSemis,
  // Exprés
  generarFixtureExpres,
  planificarExpres,
  prepararCapturaExpres,
  computeTablaExpres,
  computeClinchExpres,
  partidosPendientes,
  MARCADORES_SUMA6,
  PARTIDOS_POR_PAREJA,
  CUPO_MINIMO,
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

  // ── Exprés: un torneo de 12 parejas, sorteado, jugado y contado ───────────
  const pairIds = Array.from({ length: CUPO_MINIMO }, (_, i) => `p${i + 1}`);

  const fixture = generarFixtureExpres({ pairIds, semilla: 'bundle-check' });

  const plan = planificarExpres({
    cupo: CUPO_MINIMO,
    canchas: 3,
    partidosPorPareja: PARTIDOS_POR_PAREJA,
    ventana: { desde: '12:00', hasta: '19:00' },
    minutos: { group: 30, quarter: 30, semi: 30, final: 45 },
  });

  const grupoA = fixture.grupos[0];
  const resultados = fixture.partidos
    .filter((m) => m.grupo === 'A')
    .map((m) => ({
      matchId: m.ref,
      pairAId: m.pairAId,
      pairBId: m.pairBId,
      gamesA: null as number | null,
      gamesB: null as number | null,
    }));

  const captura = prepararCapturaExpres({
    pairIds: grupoA.pairIds,
    resultados,
    matchId: resultados[0].matchId,
    gamesA: MARCADORES_SUMA6[2].gamesA,
    gamesB: MARCADORES_SUMA6[2].gamesB,
  });

  const tabla = computeTablaExpres({ pairIds: grupoA.pairIds, resultados });
  const clinch = computeClinchExpres({ pairIds: grupoA.pairIds, resultados });

  const expresOk =
    fixture.grupos.length === 2 &&
    fixture.totalPartidos === 30 &&
    plan.franjas.length === PARTIDOS_POR_PAREJA * 2 + 3 &&
    captura.partido.winnerPairId === null &&
    captura.standings.length === grupoA.pairIds.length &&
    tabla.filas.length === grupoA.pairIds.length &&
    clinch.length === grupoA.pairIds.length &&
    partidosPendientes(resultados) === resultados.length;

  return new Response(
    JSON.stringify({ ok: fns.every((f) => typeof f === 'function') && expresOk }),
    { headers: { 'content-type': 'application/json' } },
  );
});
