/**
 * RALLY · Los imports que Deno exige, comprobados antes del deploy
 *
 * EL FALLO QUE ESTE TEST HABRÍA EVITADO
 *   `supabase functions deploy close-registration` reventó con:
 *
 *     Failed to bundle: Module not found ".../src/lib/engine/schedule/knockout"
 *       at .../src/lib/engine/schedule/bloques.ts:18:32
 *
 *   Deno exige la extensión en los imports relativos; `tsc` y jest no. Así que
 *   `import { FACTOR_RETRASO } from './knockout'` compilaba, pasaba los tests,
 *   se commiteaba y se pusheaba — y solo fallaba en el deploy, que es el único
 *   sitio donde nadie estaba mirando.
 *
 *   Peor: como el deploy fallaba en silencio para quien no leía la salida
 *   entera, la Edge Function vieja se quedaba viva y el cambio parecía
 *   aplicado. Se perdió una vuelta completa depurando la migración y el commit
 *   cuando el problema era una extensión.
 *
 * POR QUÉ AQUÍ Y NO EN UN SCRIPT SUELTO
 *   Un script hay que acordarse de correrlo; un test corre en `npm test` y en
 *   CI sin que nadie decida nada. Y este fallo es exactamente del tipo que se
 *   olvida: aparece semanas después, en otra máquina, en el peor momento.
 *
 * QUÉ COMPRUEBA
 *   Recorre el grafo de imports RELATIVOS desde cada Edge Function y exige que
 *   todos lleven extensión explícita. No valida los `jsr:`/`npm:` ni los del
 *   import map: de esos ya se queja el propio bundler con un mensaje claro.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';

const RAIZ = resolve(__dirname, '../../..');
const FUNCIONES = resolve(RAIZ, 'supabase/functions');

/** `from './x'` e `import('./x')`. Solo relativos: los demás no son cosa nuestra. */
const RE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;

const TIENE_EXTENSION = /\.(ts|tsx|js|mjs|json)$/;

interface Hallazgo {
  archivo: string;
  linea: number;
  especificador: string;
}

/** Sigue la cadena desde una entrada y devuelve los imports sin extensión. */
function revisarDesde(entradas: string[]): Hallazgo[] {
  const vistos = new Set<string>();
  const malos: Hallazgo[] = [];

  const recorrer = (archivo: string) => {
    if (vistos.has(archivo) || !existsSync(archivo)) return;
    vistos.add(archivo);

    const src = readFileSync(archivo, 'utf8');
    for (const m of src.matchAll(RE_IMPORT)) {
      const especificador = m[1];
      if (!TIENE_EXTENSION.test(especificador)) {
        malos.push({
          archivo: relative(RAIZ, archivo),
          linea: src.slice(0, m.index).split('\n').length,
          especificador,
        });
      }

      // Se sigue la cadena aunque el import esté mal escrito: interesa el
      // informe COMPLETO, no el primero. Arreglar de uno en uno con un deploy
      // fallido de por medio es justo lo que costó la vuelta.
      const base = resolve(dirname(archivo), especificador);
      for (const candidato of [base, `${base}.ts`, `${base}/index.ts`]) {
        if (existsSync(candidato) && candidato.endsWith('.ts')) {
          recorrer(candidato);
          break;
        }
      }
    }
  };

  entradas.forEach(recorrer);
  return malos;
}

/** Cada carpeta de `supabase/functions` con un index.ts. `_shared` no es una. */
function edgeFunctions(): string[] {
  return readdirSync(FUNCIONES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => resolve(FUNCIONES, d.name, 'index.ts'))
    .filter(existsSync);
}

describe('imports de las Edge Functions', () => {
  it('hay funciones que revisar (si no, el test no prueba nada)', () => {
    // Sin esto, un cambio de estructura dejaría el test en verde revisando cero
    // archivos, que es la forma más silenciosa de perder una red de seguridad.
    expect(edgeFunctions().length).toBeGreaterThan(5);
  });

  it('todos los imports relativos llevan extensión: Deno la exige', () => {
    // Las dos entradas por función: el index y su shim `engine.ts`, que es el
    // que importa `src/lib/engine/**` directo y por donde entró el fallo.
    const entradas = edgeFunctions().flatMap((idx) => {
      const shim = resolve(dirname(idx), 'engine.ts');
      return existsSync(shim) ? [idx, shim] : [idx];
    });

    const malos = revisarDesde(entradas);
    const informe = malos
      .map((m) => `  ${m.archivo}:${m.linea}  '${m.especificador}'  → falta la extensión`)
      .join('\n');

    expect(informe).toBe('');
  });

  it('la cadena del engine que consume close-registration está cubierta', () => {
    // El caso concreto que reventó, fijado aparte: si alguien vuelve a añadir
    // un import sin extensión en bloques.ts o en format/, salta aquí con el
    // nombre del archivo y no en un deploy.
    const shim = resolve(FUNCIONES, 'close-registration/engine.ts');
    expect(existsSync(shim)).toBe(true);
    expect(revisarDesde([shim])).toEqual([]);
  });
});
