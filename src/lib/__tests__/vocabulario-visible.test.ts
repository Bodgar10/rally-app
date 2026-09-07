/**
 * RALLY · "Sembrar" no se dice en México
 *
 * Es terminología de torneos traducida del inglés. Un organizador mexicano no
 * la usa: lo que hace es DEFINIR LOS ENFRENTAMIENTOS — quién juega contra quién
 * en la primera ronda.
 *
 * EN EL CÓDIGO SE QUEDA, EN LA PANTALLA NO
 *   `sembrar` es el segmento de una ruta, `cuadro_sembrado` un código de error
 *   de Postgres, `validarSiembra` una función del motor que también vive dentro
 *   de una Edge Function y del bundle. Renombrarlos tocaría el motor, las
 *   funciones y la base a cambio de nada. Lo que no puede pasar es que se
 *   filtre UNA VEZ a lo que el organizador lee.
 *
 * CÓMO SE DISTINGUE LO UNO DE LO OTRO
 *   No hay forma estática de saber qué string se pinta. Así que se hace al
 *   revés: se prohíbe la palabra en todo el texto no comentado, y lo que
 *   legítimamente la conserva va en `PERMITIDO` con su motivo. La lista es
 *   corta, se lee entera, y añadir a ella es un acto deliberado — que es
 *   exactamente la fricción que hace falta para que nadie cuele un `<Text>`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');

/** Dónde vive el texto que el usuario puede llegar a leer. */
const CARPETAS = ['app', 'src'];

const PROHIBIDO = /sembr|siembra/i;

/**
 * Lo que SÍ puede conservar la palabra, y por qué.
 *
 * Cada patrón se compara contra la línea completa. Si una línea contiene la
 * palabra y NINGUNO la explica, el test falla y nombra el archivo.
 */
const PERMITIDO: Array<{ patron: RegExp; motivo: string }> = [
  { patron: /^import\s|^\}\s*from\s|from '[^']*siembra[^']*'|from '[^']*sembrar[^']*'/,
    motivo: 'ruta de módulo' },
  { patron: /^export \{|^export type \{|^export \* /, motivo: 're-export' },
  { patron: /torneos\/\$\{tournamentId\}\/sembrar|'sembrar'|\/sembrar\b/,
    motivo: 'segmento de ruta: la URL no cambia' },
  { patron: /cuadro_sembrado|ya_sembrada|hay_que_resembrar|'resembrar'/,
    motivo: 'código de error de Postgres o valor de un tipo' },
  { patron: /\b(validarSiembra|checklistDeSiembra|listasParaSembrar|puedeSembrar|ordenSiembra|CategoriaParaSembrar|EstadoDeCategoria|siembraDaBye|siembraClasifica|computeSeeding)\b/,
    motivo: 'identificador del motor' },
  { patron: /\b(cuadroSembrado|seSiembraEnLote|setSembrando|sembrando|sembrarCuadro|sembrarTodas|setAvisoSiembra|avisoSiembra|SembrarScreen|FilaCategoriaSiembra|hayCuadroSembrado|setCatsSembradas|catsSembradas|const siembra|MotivoFuera)\b/,
    motivo: 'variable, componente o estado interno' },
  { patron: /\b(botonSembrar|botonSembrarOff|botonSembrarTexto|botonSembrarTextoOff|siembraBloqueada|siembraHecha)\b/,
    motivo: 'nombre de un estilo, en su definición o en su uso' },
  { patron: /\b(resumenSiembra|siembra\.matches)\b/, motivo: 'variable local' },
  { patron: /fallo\('(sembrar|grupos)\/[^']*'/, motivo: 'etiqueta de log, no se pinta' },
];

function archivos(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // Los tests hablan de la siembra por su nombre a propósito: describen el
      // motor, no la pantalla.
      if (e.name === '__tests__') continue;
      salida.push(...archivos(p));
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      salida.push(p);
    }
  }
  return salida;
}

/** Quita comentarios de línea y de bloque, que no se pintan. */
function sinComentarios(texto: string): Array<{ n: number; linea: string }> {
  const salida: Array<{ n: number; linea: string }> = [];
  let enBloque = false;
  texto.split('\n').forEach((cruda, i) => {
    let linea = cruda;
    if (enBloque) {
      const fin = linea.indexOf('*/');
      if (fin < 0) return;
      enBloque = false;
      linea = linea.slice(fin + 2);
    }
    // Los /* … */ que abren y cierran en la misma línea, primero: si no, el
    // `/** Comentario de una línea */` se colaba entero como si fuera código.
    linea = linea.replace(/\/\*.*?\*\//g, '');
    // Y el que abre sin cerrar, que deja el bloque abierto.
    const abre = linea.indexOf('/*');
    if (abre >= 0) {
      enBloque = true;
      linea = linea.slice(0, abre);
    }
    const doble = linea.indexOf('//');
    if (doble >= 0) linea = linea.slice(0, doble);
    if (linea.trim()) salida.push({ n: i + 1, linea });
  });
  return salida;
}

describe('"sembrar" no llega a la pantalla', () => {
  it('ninguna línea de código la usa sin una razón declarada', () => {
    const colados: string[] = [];

    for (const carpeta of CARPETAS) {
      for (const archivo of archivos(join(RAIZ, carpeta))) {
        const texto = readFileSync(archivo, 'utf8');
        for (const { n, linea } of sinComentarios(texto)) {
          if (!PROHIBIDO.test(linea)) continue;
          if (PERMITIDO.some((p) => p.patron.test(linea.trim()))) continue;
          colados.push(`${archivo.slice(RAIZ.length + 1)}:${n}  ${linea.trim().slice(0, 100)}`);
        }
      }
    }

    expect(colados).toEqual([]);
  });

  // La prueba de que el barrido muerde: si esto pasara, el test de arriba no
  // valdría nada.
  it('el barrido detecta la palabra en un texto normal', () => {
    const falso = [{ n: 1, linea: "  <Text>Sembrar los cuadros</Text>" }];
    expect(PROHIBIDO.test(falso[0].linea)).toBe(true);
    expect(PERMITIDO.some((p) => p.patron.test(falso[0].linea.trim()))).toBe(false);
  });

  it('y deja pasar lo que es código', () => {
    for (const codigo of [
      "import { validarSiembra } from '@/lib/engine/validacion-siembra';",
      "router.push(`/(organizer)/org/torneos/${tournamentId}/sembrar`)",
      "} else if (re.message.includes('cuadro_sembrado')) {",
      "const [sembrando, setSembrando] = useState(false);",
    ]) {
      expect(PERMITIDO.some((p) => p.patron.test(codigo.trim()))).toBe(true);
    }
  });
});
