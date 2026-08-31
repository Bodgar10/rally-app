// Shim para el deploy de Edge Functions (el bundler exige extensiones .ts explícitas).
// Re-exporta solo lo que close-registration necesita del engine, sin tocar src/lib/engine/*.
export { computeFormat } from "../../../src/lib/engine/format/index.ts";
export { generateRoundRobin } from "../../../src/lib/engine/fixtures/index.ts";
export { repartirPorBloque } from "../../../src/lib/engine/schedule/reparto.ts";
export { generarBloques } from "../../../src/lib/engine/schedule/bloques.ts";
export type { FormatPlan } from "../../../src/lib/engine/format/rules.ts";
export type { Fixture } from "../../../src/lib/engine/fixtures/index.ts";
