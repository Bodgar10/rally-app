/**
 * RALLY · Lo que las Edge Functions importan del bundle, existe en el bundle
 *
 * EL FALLO QUE ESTE TEST HABRÍA EVITADO
 *   `match-result` importaba `validateParcial` del bundle. La función existía
 *   en `src/lib/engine/score`, pero nadie la había reexportado desde
 *   `_edge-entry.ts`, que es lo que define qué sale en el bundle. Resultado:
 *
 *     import { validateParcial } from '../_shared/engine.bundle.js'
 *
 *   apuntaba a un nombre que no estaba. En un módulo ES eso NO es un error de
 *   ejecución que se pueda capturar: es un error de ENLACE, y ocurre antes de
 *   que el módulo llegue a evaluarse. `Deno.serve` nunca se registra, así que
 *   la función devuelve 503 hasta al preflight OPTIONS, sin cabeceras CORS, y
 *   el navegador lo reporta como "CORS error" — un síntoma que no se parece en
 *   nada a la causa.
 *
 *   Y nada lo atrapaba: `tsc` no mira el bundle generado, jest no importa las
 *   Edge Functions, `build:engine` compiló tan contento un bundle sin ese
 *   símbolo, y el deploy no ejecuta el módulo. Solo se rompía en producción.
 *
 * ES EL HERMANO DE `imports-edge-functions.test.ts`
 *   Aquel comprueba que los imports relativos lleven extensión, porque Deno la
 *   exige y tsc no. Este comprueba que los NOMBRES importados del bundle
 *   existan. Los dos fallan solo en el arranque, que es el único sitio donde
 *   nadie está mirando.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../../..');
const FUNCIONES = resolve(RAIZ, 'supabase/functions');
const BUNDLE = resolve(FUNCIONES, '_shared/engine.bundle.js');

/** `import { a, b } from '.../engine.bundle.js'` → ['a', 'b'] */
const RE_IMPORT_BUNDLE =
  /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*engine\.bundle\.js['"]/g;

/** Los nombres que el bundle exporta de verdad, de su `export { ... }` final. */
function exportadosDelBundle(): Set<string> {
  const src = readFileSync(BUNDLE, 'utf8');
  const nombres = new Set<string>();
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const bruto of m[1].split(',')) {
      // 'x as y' exporta `y`; 'type X' no es un valor y no se importa en runtime.
      const pieza = bruto.trim();
      if (!pieza || pieza.startsWith('type ')) continue;
      const partes = pieza.split(/\s+as\s+/);
      nombres.add((partes[1] ?? partes[0]).trim());
    }
  }
  return nombres;
}

/** Cada Edge Function con los nombres que le pide al bundle. */
function importesPorFuncion(): { funcion: string; nombres: string[] }[] {
  const salida: { funcion: string; nombres: string[] }[] = [];
  for (const dir of readdirSync(FUNCIONES)) {
    const entrada = resolve(FUNCIONES, dir, 'index.ts');
    if (!existsSync(entrada)) continue;
    const src = readFileSync(entrada, 'utf8');
    const nombres: string[] = [];
    for (const m of src.matchAll(RE_IMPORT_BUNDLE)) {
      for (const bruto of m[1].split(',')) {
        const pieza = bruto.trim();
        if (!pieza || pieza.startsWith('type ')) continue;
        nombres.push(pieza.split(/\s+as\s+/)[0].trim());
      }
    }
    if (nombres.length > 0) salida.push({ funcion: dir, nombres });
  }
  return salida;
}

describe('los nombres que las Edge Functions importan del bundle existen', () => {
  it('el bundle está construido', () => {
    expect(existsSync(BUNDLE)).toBe(true);
  });

  const exportados = existsSync(BUNDLE) ? exportadosDelBundle() : new Set<string>();
  const funciones = existsSync(BUNDLE) ? importesPorFuncion() : [];

  it('hay Edge Functions que consumen el bundle', () => {
    // Si esto falla, el test dejó de mirar donde creía y no protege nada.
    expect(funciones.length).toBeGreaterThan(0);
  });

  for (const { funcion, nombres } of funciones) {
    it(`${funcion}: ninguno de sus ${nombres.length} imports falta en el bundle`, () => {
      const faltan = nombres.filter((n) => !exportados.has(n));
      // El mensaje dice el nombre y la salida: sin esto, el fallo es un 503 en
      // producción y media hora de logs.
      expect(
        faltan.length === 0
          ? 'ok'
          : `${funcion} importa del bundle nombres que no existen: ${faltan.join(', ')}. ` +
            `Reexpórtalos desde src/lib/engine/_edge-entry.ts y corre npm run build:engine.`,
      ).toBe('ok');
    });
  }
});
