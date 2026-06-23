// Shim para el deploy de Edge Functions (el bundler exige extensiones .ts explícitas).
// Re-exporta solo lo que generate-format necesita del engine, sin tocar src/lib/engine/*.
// El import interno './rules' de format/index.ts queda resuelto por la entrada del import_map.
export { computeFormat } from "../../../src/lib/engine/format/index.ts";
export type { FormatPlan } from "../../../src/lib/engine/format/rules.ts";
