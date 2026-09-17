// src/lib/engine/expres/circulo.ts
// El reparto de partidos, en índices. Aritmética pura: ni parejas, ni sorteo,
// ni horarios. Aislado para poder verificarlo exhaustivamente.
//
// EL PROBLEMA
//
//   N parejas donde cada una juega K partidos, con K < N−1, sin repetir rival
//   y agrupados en rondas donde nadie juega dos veces. En teoría de grafos: un
//   grafo K-regular sobre N vértices descompuesto en emparejamientos.
//
// LA RESPUESTA, VERIFICADA ANTES DE ESCRIBIR ESTO
//
//   Con N PAR existe solución para todo K ≤ N−1. No hay huecos ni casos raros.
//   Y cabe en EXACTAMENTE K rondas, que es el mínimo posible por dos motivos
//   independientes: cada pareja juega K veces y como mucho una por ronda
//   (R ≥ K), y cada ronda tiene como mucho N/2 partidos (R ≥ K otra vez).
//
//   La construcción es el round-robin circular de toda la vida CORTADO en la
//   ronda K. Se comprobó por fuerza bruta —backtracking que busca el reparto
//   sin conocer esta construcción— que para N = 6, 8, 10, 12 y K = 3…7 el
//   mínimo de rondas es K y no menos, y por validación directa que las 399
//   combinaciones de N par 4..40 × K 1..N−1 cumplen las cuatro restricciones.
//
// LA PROPIEDAD QUE MÁS VALE: ES PREFIJO
//
//   Las K rondas están CONTENIDAS en las de K+1. Cortar antes no reordena
//   nada. Por eso K se puede subir o bajar sin recalcular el torneo, y por eso
//   una ronda añadida a última hora no invalida lo ya jugado.
//
// POR QUÉ N IMPAR NO ENTRA AQUÍ
//
//   Con N impar y K impar es imposible de raíz: la suma de grados de un grafo
//   es siempre par y N·K sería impar. Con N impar y K par el reparto existe,
//   pero ninguna ronda puede estar llena —no hay emparejamiento perfecto sobre
//   un número impar de vértices—, hacen falta K+1 rondas y los descansos caen
//   desiguales. Como el exprés juega 5 partidos (impar), el caso par ni se
//   presenta: `rondasDelCirculo` exige N par y lo dice.

/** Un partido en índices, siempre con el menor primero. */
export type ParIndices = readonly [number, number];

/**
 * Las primeras `k` rondas del round-robin circular sobre `n` índices.
 *
 * Vértice `n−1` fijo, el resto rota. En la ronda `r` (0-based) el fijo juega
 * contra `r`, y los demás se emparejan simétricamente alrededor del círculo:
 * `(r+i) mod (n−1)` contra `(r−i) mod (n−1)`.
 *
 * Determinista y sin estado: misma entrada, misma salida, siempre.
 */
export function rondasDelCirculo(n: number, k: number): ParIndices[][] {
  if (!Number.isInteger(n) || n < 2) {
    throw new Error(
      `rondasDelCirculo: n debe ser un entero >= 2; llegó ${JSON.stringify(n)}.`,
    );
  }
  if (n % 2 !== 0) {
    throw new Error(
      `rondasDelCirculo: n debe ser PAR y llegó ${n}. Con un número impar de ` +
        `parejas no existe reparto donde todas jueguen el mismo número de ` +
        `partidos: alguna tendría que descansar y su balance de games dejaría ` +
        `de ser comparable con el del resto.`,
    );
  }
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(
      `rondasDelCirculo: k debe ser un entero >= 1; llegó ${JSON.stringify(k)}.`,
    );
  }
  if (k > n - 1) {
    throw new Error(
      `rondasDelCirculo: k=${k} es imposible con n=${n}. Cada pareja solo ` +
        `tiene ${n - 1} rivales distintos, así que jugar ${k} partidos sin ` +
        `repetir a ninguno no se puede.`,
    );
  }

  const m = n - 1; // posiciones rotatorias 0..n−2; el vértice n−1 no rota
  const rondas: ParIndices[][] = [];

  for (let r = 0; r < k; r++) {
    const ronda: ParIndices[] = [ordenar(m, r)];
    for (let i = 1; i < n / 2; i++) {
      ronda.push(ordenar((r + i) % m, (((r - i) % m) + m) % m));
    }
    rondas.push(ronda);
  }

  return rondas;
}

function ordenar(a: number, b: number): ParIndices {
  return a < b ? [a, b] : [b, a];
}

/**
 * Comprueba que un reparto cumple las cuatro restricciones, y lanza si no.
 *
 * SE EJECUTA SIEMPRE, no solo en los tests. La corrección aquí es
 * combinatoria: un fallo no se ve como una excepción sino como un torneo que
 * parece normal y tiene la tabla sesgada —una pareja con 4 partidos y otra con
 * 6— y eso no se descubre hasta que alguien reclama el domingo por la tarde.
 * Verificar cuesta O(n·k) sobre unas decenas de partidos; callarse cuesta un
 * torneo.
 */
export function verificarReparto(n: number, k: number, rondas: ParIndices[][]): void {
  const fallo = (motivo: string): never => {
    throw new Error(
      `verificarReparto: el reparto para n=${n}, k=${k} es inválido (${motivo}). ` +
        `Esto es un fallo del motor, no de los datos.`,
    );
  };

  if (rondas.length !== k) fallo(`${rondas.length} rondas en vez de ${k}`);

  const grados = new Array<number>(n).fill(0);
  const vistos = new Set<string>();

  for (const [idx, ronda] of rondas.entries()) {
    const ocupados = new Set<number>();
    for (const [a, b] of ronda) {
      if (a === b) fallo(`una pareja contra sí misma en la ronda ${idx + 1}`);
      if (a < 0 || b >= n) fallo(`índice fuera de rango en la ronda ${idx + 1}`);
      if (ocupados.has(a) || ocupados.has(b)) {
        fallo(`alguien juega dos veces en la ronda ${idx + 1}`);
      }
      ocupados.add(a);
      ocupados.add(b);

      const clave = `${a}-${b}`;
      if (vistos.has(clave)) fallo(`rival repetido (${clave})`);
      vistos.add(clave);

      grados[a]++;
      grados[b]++;
    }
  }

  const desigual = grados.findIndex((g) => g !== k);
  if (desigual !== -1) {
    fallo(`el índice ${desigual} juega ${grados[desigual]} partidos y no ${k}`);
  }
  if (vistos.size !== (n * k) / 2) {
    fallo(`${vistos.size} partidos en vez de ${(n * k) / 2}`);
  }
}
