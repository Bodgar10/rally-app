/**
 * El Sexto Torneo Cimepa entero, contra el scheduler.
 *
 * LOS DATOS SON LOS REALES, no una muestra: las ocho categorias de
 * `scripts/seed-cimepa.mjs` (21, 30, 30, 30, 15, 12, 18 y 9 parejas), que
 * `computeFormat` reparte en 55 grupos de 3 y 165 partidos. Ocho canchas,
 * viernes de 14:00 a 23:00 y sabado de 08:00 a 23:00.
 *
 * LA CIFRA QUE HAY QUE MIRAR AL REVES ES LA OCUPACION
 *   165 partidos sobre 192 canchas-hora es 85,9 %, y es el numero que hubo de
 *   verdad. Un resultado MUY POR ENCIMA no seria una mejora: significaria que
 *   el scheduler uso menos bloques de los que la gente eligio, y los que
 *   sobrarian son los del viernes por la tarde — la hora a la que se trabaja.
 */

import { generarBloques } from '../bloques';
import { generateRoundRobin } from '../../fixtures';
import { computeFormat } from '../../format';
import { programarGrupos, type GrupoAProgramar } from '../grupos';

// ── Cimepa ──────────────────────────────────────────────────────────────────

/** Copia literal de CATEGORIAS en `scripts/seed-cimepa.mjs`. */
const CATEGORIAS = [
  { id: '2A',  parejas: 21 },
  { id: '3A',  parejas: 30 },
  { id: '4A',  parejas: 30 },
  { id: '5A',  parejas: 30 },
  { id: '6A',  parejas: 15 },
  { id: '5F',  parejas: 12 },
  { id: 'MxD', parejas: 18 },
  { id: 'MxC', parejas:  9 },
];

const RETICULA = generarBloques({
  ventanas: [
    { dia: '2026-09-11', desde: '14:00', hasta: '23:00' },   // viernes
    { dia: '2026-09-12', desde: '08:00', hasta: '23:00' },   // sabado
    { dia: '2026-09-13', desde: '08:00', hasta: '20:00' },   // domingo: eliminatorias
  ],
  canchas: 8,
  minutosPorPartido: 60,
});

/**
 * Los 55 grupos con sus partidos, repartidos por los bloques.
 *
 * DE DONDE SALE EL REPARTO
 *   Del mismo sitio que en produccion: la pareja elige bloque al inscribirse y
 *   `repartirPorBloque` arma los grupos dentro de cada uno. Aqui se modela esa
 *   eleccion como lo que es —gente decidiendo por su cuenta—: los grupos de
 *   cada categoria se van repartiendo por los bloques que tengan hueco, cada
 *   categoria arrancando en uno distinto. Eso es lo que produce el patron real
 *   de MxD con un grupo por bloque, no seis apilados en el mismo.
 *
 *   Apilar cada categoria en bloques consecutivos —lo primero que probe— es lo
 *   que NO hace la gente, y ademas hacia imposible medir la continuidad de
 *   cancha: con cinco grupos a la vez hacen falta cinco canchas por definicion.
 *
 * EL VIERNES DE 14:00 A 17:00 SE QUEDA EN 3 CANCHAS DE 8
 *   Es el dato del torneo real y la razon de que la ocupacion tope en el 85 %.
 *   A esa hora la gente trabaja, y el hueco no es desperdicio: es el precio de
 *   dejarles elegir.
 */
function cimepa(): GrupoAProgramar[] {
  const grupos: GrupoAProgramar[] = [];
  const nombres = 'ABCDEFGHIJKLMNOP'.split('');

  // Carriles libres por bloque. El primero, el del viernes a las 14:00, solo
  // recibe 3: es lo que se lleno de verdad.
  const hueco = RETICULA.bloques.map((_, i) => (i === 0 ? 3 : 8));

  CATEGORIAS.forEach((cat, iCat) => {
    const sizes = computeFormat(cat.parejas).groupSizes;
    // Cada categoria empieza en un bloque distinto: no se ponen todos de
    // acuerdo para llenar el mismo hueco.
    let cursor = iCat % RETICULA.bloques.length;

    sizes.forEach((size, idx) => {
      let vueltas = 0;
      while (hueco[cursor] === 0 && vueltas < hueco.length) {
        cursor = (cursor + 1) % hueco.length;
        vueltas += 1;
      }
      const bloque = RETICULA.bloques[cursor];
      hueco[cursor] -= 1;
      cursor = (cursor + 1) % hueco.length;

      const parejas = Array.from({ length: size }, (_, k) => `${cat.id}-p${idx}-${k}`);
      grupos.push({
        id:         `${cat.id}-${nombres[idx]}`,
        categoryId: cat.id,
        nombre:     nombres[idx],
        bloqueId:   bloque.id,
        partidos:   generateRoundRobin(parejas).map((f, k) => ({
          matchId: `${cat.id}-${nombres[idx]}-m${k}`,
          pairAId: f.pairAId,
          pairBId: f.pairBId,
          ronda:   f.round,
        })),
      });
    });
  });
  return grupos;
}

const GRUPOS = cimepa();

const plan = () => programarGrupos({
  bloques: RETICULA.bloques,
  minutosPorPartido: 60,
  grupos: GRUPOS,
});

// ── Pruebas ─────────────────────────────────────────────────────────────────

describe('la forma del torneo', () => {
  it('55 grupos de 3 y 165 partidos, como el torneo real', () => {
    expect(GRUPOS.length).toBe(55);
    expect(GRUPOS.every((g) => g.partidos.length === 3)).toBe(true);
    expect(GRUPOS.reduce((a, g) => a + g.partidos.length, 0)).toBe(165);
  });

  it('la reticula da 8 bloques y 192 canchas-hora', () => {
    expect(RETICULA.bloques.length).toBe(8);
    expect(RETICULA.capacidadCarriles).toBe(64);
  });
});

describe('Cimepa cabe', () => {
  const r = plan();

  it('los 165 partidos quedan programados y ninguno se queda fuera', () => {
    expect(r.partidos.length).toBe(165);
    expect(r.sinProgramar).toEqual([]);
    expect(r.sobrevendidos).toEqual([]);
  });

  it('la ocupacion es el 85,9 % que hubo de verdad', () => {
    expect(r.ocupacion.canchasHoraUsadas).toBe(165);
    expect(r.ocupacion.canchasHoraDisponibles).toBe(192);
    expect(r.ocupacion.porcentaje).toBe(85.9);
    // Cota SUPERIOR, no objetivo: por encima del 90 % habria compactado el
    // viernes por la tarde, que es la hora a la que la gente trabaja.
    expect(r.ocupacion.porcentaje).toBeLessThan(90);
  });

  it('el viernes de 14:00 a 17:00 se queda flojo, y esta bien', () => {
    const viernesTarde = r.ocupacionPorBloque.find((b) => b.bloqueId === '2026-09-11-14:00')!;
    expect(viernesTarde.canchasUsadas).toBe(3);
    expect(viernesTarde.carriles).toBe(8);
  });

  it('los 55 grupos juegan sus 3 partidos en un solo bloque y una sola cancha', () => {
    for (const g of GRUPOS) {
      const suyos = r.partidos.filter((p) => p.groupId === g.id);
      expect(suyos.length).toBe(3);
      expect(new Set(suyos.map((p) => p.bloqueId)).size).toBe(1);
      expect(new Set(suyos.map((p) => p.cancha)).size).toBe(1);
      // Turnos consecutivos desde el principio del bloque.
      expect(suyos.map((p) => p.ordenEnBloque).sort()).toEqual([0, 1, 2]);
    }
  });

  it('ningun partido se desplaza: no hizo falta partir ningun grupo', () => {
    expect(r.partidos.filter((p) => p.desplazado)).toEqual([]);
  });

  it('dos partidos nunca comparten cancha y hora', () => {
    const vistos = new Set<string>();
    for (const p of r.partidos) {
      const clave = `${p.bloqueId}#${p.cancha}#${p.ordenEnBloque}`;
      expect(vistos.has(clave)).toBe(false);
      vistos.add(clave);
    }
  });

  it('una pareja nunca juega dos partidos a la vez', () => {
    const porInstante = new Map<string, Set<string>>();
    const parejaDe = new Map(
      GRUPOS.flatMap((g) => g.partidos.map((p) => [p.matchId, [p.pairAId, p.pairBId]] as const)),
    );
    for (const p of r.partidos) {
      const clave = `${p.inicio}`;
      if (!porInstante.has(clave)) porInstante.set(clave, new Set());
      const set = porInstante.get(clave)!;
      for (const pareja of parejaDe.get(p.matchId)!) {
        expect(set.has(pareja)).toBe(false);
        set.add(pareja);
      }
    }
  });
});

describe('continuidad de categoria', () => {
  const r = plan();

  /** Canchas que usa una categoria en cada bloque de un dia. */
  function canchasPorBloque(categoryId: string, dia: string) {
    const porBloque = new Map<string, Set<number>>();
    for (const p of r.partidos) {
      if (p.categoryId !== categoryId || !p.bloqueId.startsWith(dia)) continue;
      if (!porBloque.has(p.bloqueId)) porBloque.set(p.bloqueId, new Set());
      porBloque.get(p.bloqueId)!.add(p.cancha);
    }
    return porBloque;
  }

  const SABADO = '2026-09-12';

  it('Mixtos D y 2a Fuerza juegan el sabado entero en UNA sola cancha', () => {
    // Es el dato de §2.1: "Mixtos D tuvo la Cancha 8 catorce horas del sabado,
    // 2a Fuerza la Cancha 3". Los numeros de cancha no tienen por que coincidir
    // con los del torneo real —dependen del orden de llegada—, pero que cada
    // una se quede en UNA sola es justo lo que hace que el juez y los jugadores
    // sepan a donde ir sin preguntar.
    for (const id of ['MxD', '2A']) {
      const canchas = new Set(
        [...canchasPorBloque(id, SABADO).values()].flatMap((s) => [...s]),
      );
      expect(canchas.size).toBe(1);
    }
  });

  it('casi ninguna categoria gasta mas canchas de las que necesita', () => {
    // El minimo posible es cuantos grupos tiene a la vez: dos grupos a la misma
    // hora exigen dos canchas, no hay vuelta. La continuidad es una PREFERENCIA
    // (§2.1), asi que se mide cuantas categorias la conservan, no se exige que
    // todas lo hagan.
    let enElMinimo = 0;
    for (const cat of CATEGORIAS) {
      const porBloque = canchasPorBloque(cat.id, SABADO);
      if (porBloque.size === 0) continue;
      const simultaneosMax = Math.max(...[...porBloque.values()].map((s) => s.size));
      const distintas = new Set([...porBloque.values()].flatMap((s) => [...s])).size;
      if (distintas === simultaneosMax) enElMinimo += 1;
    }
    // 7 de 8. La que se sale es Mixtos C: su cancha estaba tomada por 6a Fuerza
    // al llegar, y ceder es exactamente lo que dice §2.1 que hay que hacer
    // cuando la preferencia estorba.
    expect(enElMinimo).toBe(7);
  });
});

describe('hermandad entre categorias', () => {
  // Los cruces reales de `seed-cimepa.mjs`: Cantillo juega 2a y 3a, Robelo 3a
  // y Mixtos C, Mandujano 5a Femenil y Mixtos D.
  const JUGADORES = {
    '2A':  ['cantillo', 'tapia'],
    '3A':  ['cantillo', 'robelo'],
    'MxC': ['robelo', 'minana'],
    '5F':  ['mandujano'],
    'MxD': ['edgar', 'mandujano'],
    '4A':  ['otro-4a'],
    '5A':  ['otro-5a'],
    '6A':  ['paz'],
  };

  const r = programarGrupos({
    bloques: RETICULA.bloques,
    minutosPorPartido: 60,
    grupos: GRUPOS,
    jugadoresPorCategoria: JUGADORES,
  });

  it('los empalmes NO son cero, y la especificacion decia que si', () => {
    // §7 esperaba 0. No puede salir 0: cada categoria tiene un grupo en casi
    // todos los bloques, asi que dos hermanas coinciden practicamente siempre.
    // Y no hay orden de partidos que lo arregle: en un grupo de 3 cada pareja
    // juega 2 de los 3 turnos, y dos subconjuntos de 2 sobre 3 siempre se
    // cruzan. Solo se puede AVISAR.
    expect(r.empalmes.length).toBeGreaterThan(0);

    const pares = new Set(r.empalmes.map((e) => `${e.categoriaA}|${e.categoriaB}`));
    expect(pares).toEqual(new Set(['2A|3A', '3A|MxC', '5F|MxD']));
  });

  it('el empalme no cambia el calendario: nadie se mueve de bloque', () => {
    const sinHermandad = plan();
    expect(r.partidos).toEqual(sinHermandad.partidos);
  });

  it('lo dice en los avisos, con el motivo', () => {
    expect(r.avisos.some((a) => a.includes('comparten jugadores'))).toBe(true);
  });
});

describe('encadenamientos', () => {
  const r = plan();

  it('en cada grupo de 3 encadenan DOS parejas, no una', () => {
    // La especificacion dice "exactamente 1 por grupo" y no sale: en un round
    // robin de 3 hay tres turnos y cada pareja juega dos, asi que dos de las
    // tres caen en turnos seguidos. Es aritmetica, no un fallo del reparto.
    for (const g of GRUPOS) {
      const suyos = r.partidos.filter((p) => p.groupId === g.id);
      const turnoDe = new Map(suyos.map((p) => [p.matchId, p.ordenEnBloque]));

      const turnos = new Map<string, number[]>();
      for (const p of g.partidos) {
        for (const pareja of [p.pairAId, p.pairBId]) {
          if (!turnos.has(pareja)) turnos.set(pareja, []);
          turnos.get(pareja)!.push(turnoDe.get(p.matchId)!);
        }
      }

      let encadenan = 0;
      for (const ts of turnos.values()) {
        const orden = [...ts].sort((a, b) => a - b);
        if (orden.some((t, i) => i > 0 && t === orden[i - 1] + 1)) encadenan += 1;
      }
      expect(encadenan).toBe(2);
    }
  });
});

describe('determinismo', () => {
  it('dos corridas dan exactamente lo mismo', () => {
    expect(JSON.stringify(plan())).toBe(JSON.stringify(plan()));
  });

  it('el orden de la entrada no cambia el resultado', () => {
    const alReves = programarGrupos({
      bloques: [...RETICULA.bloques].reverse(),
      minutosPorPartido: 60,
      grupos: [...GRUPOS].reverse(),
    });
    expect(JSON.stringify(alReves)).toBe(JSON.stringify(plan()));
  });
});
