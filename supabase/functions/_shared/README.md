# _shared/engine.bundle — cómo importar el engine desde una Edge Function

El engine vive en `src/lib/engine/*` (TS puro, con tests, **no se edita aquí**).
Para usarlo en una Edge Function (Deno) importa SIEMPRE del bundle, nunca del barrel:

```ts
import {
  validateScore,
  computeStandings,
  computeClinch,
} from '../_shared/engine.bundle.js';
```

## Regenerar el bundle
Tras cualquier cambio en el engine consumido por el servidor:
```bash
npm run build:engine
```
Commitea `engine.bundle.js` y `engine.bundle.d.ts`. El deploy de Supabase
los empaqueta tal cual (no resuelve TS del engine en build).

## Reglas
- Para exponer un motor nuevo al servidor: agrégalo a `src/lib/engine/_edge-entry.ts`
  y vuelve a correr `npm run build:engine`. No agregues entradas al `import_map.json`.
- `close-registration` quedó con su shim previo (no romper). Las funciones NUEVAS
  (`match-result`, `generate-bracket`, `cron-recompute-ratings`) usan el bundle.
