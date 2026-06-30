import { defineConfig } from 'tsup';

// Empaqueta el subset del engine en un único ESM autocontenido + .d.ts,
// para que las Edge Functions (Deno) lo importen sin import_map ni shims.
export default defineConfig({
  entry: { 'engine.bundle': 'src/lib/engine/_edge-entry.ts' },
  outDir: 'supabase/functions/_shared',
  format: ['esm'],          // Deno = ESM
  // package.json no es "type":"module" -> forzamos .js (no .mjs) para que
  // la import desde Deno sea '../_shared/engine.bundle.js'.
  outExtension: () => ({ js: '.js' }),
  // Deno NO asocia automáticamente engine.bundle.js <-> engine.bundle.d.ts por
  // nombre; necesita este pragma para cargar los tipos (si no, todo es `any`).
  banner: { js: '// @ts-self-types="./engine.bundle.d.ts"' },
  platform: 'neutral',      // sin node builtins (el engine es TS puro)
  target: 'es2022',
  // dts: ignoreDeprecations silencia TS5101 por el baseUrl heredado de
  // expo/tsconfig.base (deprecado en TS 6.0).
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  treeshake: true,
  splitting: false,
  sourcemap: false,
  clean: false,             // NO borrar otros archivos de _shared
  bundle: true,
  minify: false,
  // NOTA: tsup emite el dts de ESM como .d.mts; el script build:engine lo
  // renombra a .d.ts (el nombre al que apunta el pragma @ts-self-types).
});
