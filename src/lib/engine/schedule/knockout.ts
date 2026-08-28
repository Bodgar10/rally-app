/**
 * Scheduler de eliminatorias.
 * Asigna hora y cancha a cada partido del último día del torneo.
 * Lógica pura y determinista: misma entrada -> misma salida. Sin dependencias.
 */

export interface CategoriaCuadro {
  id: string;
  clasificados: number;
  /** Ids de jugadores que podrian llegar a eliminatorias en esta categoria. */
  jugadores?: string[];
}

export interface EntradaScheduler {
  canchas: number;
  desde: string;
  hasta: string;
  categorias: CategoriaCuadro[];
  minutosPorPartido?: number;
  descansoMinimo?: number;
  paso?: number;
}

export interface PartidoProgramado {
  categoryId: string;
  ronda: number;
  totalRondas: number;
  etapa: EtapaEliminatoria;
  indiceEnRonda: number;
  inicio: string;
  inicioMin: number;
  cancha: number;
}

export interface FranjaOcupacion {
  hora: string;
  canchas: number;
}

export interface DiagnosticoScheduler {
  partidosSinProgramar: number;
  canchasQueFaltan: number;
  horasQueFaltan: number;
}

export interface Calendario {
  cabe: boolean;
  partidos: PartidoProgramado[];
  totalPartidos: number;
  ultimoInicio: string | null;
  /** Hora de fin si todo corre a tiempo. */
  finEstimado: string | null;
  /** Hora de fin con los retrasos habituales. Es la que se le muestra al organizador. */
  finRealista: string | null;
  /** Hora de fin realista si una cancha se cae. Null si solo hay una cancha. */
  finRealistaUnaCanchaMenos: string | null;
  cotaInferior: string;
  ocupacionPorFranja: FranjaOcupacion[];
  /** Categorias hermanadas que aun asi quedaron a la misma hora. */
  empalmes: { categoriaA: string; categoriaB: string; hora: string; etapa: string }[];
  avisos: string[];
  diagnostico?: DiagnosticoScheduler;
}

/**
 * Distancia a la final a partir de la cual se evitan los empalmes.
 *
 * 2 = octavos, cuartos y anteriores. Semifinales (1) y final (0) quedan
 * exentas A PROPOSITO: al final del dia todas las categorias convergen y
 * separarlas retrasaria el torneo entero para proteger un caso que quiza no
 * ocurra. Quien entra a dos categorias asume ese riesgo; el organizador decide
 * en el momento quien espera. El motor informa, no arbitra.
 */
export const DISTANCIA_MINIMA_SEPARACION = 2;

/**
 * Pasos de reticula que una ronda temprana espera antes de rendirse.
 *
 * La separacion es una PREFERENCIA FUERTE, no una restriccion. Sin este tope,
 * un grafo de hermandad denso podria dejar canchas ociosas indefinidamente
 * esperando un hueco limpio, que es peor que el empalme que evita.
 */
export const MAX_ESPERA_POR_EMPALME = 4;

/** Un partido planificado a 60 min suele durar 75. Medido en torneos reales. */
export const FACTOR_RETRASO = 1.25;

export const DEFAULT_MINUTOS_PARTIDO = 60;
export const DEFAULT_DESCANSO_MINIMO = 30;
export const DEFAULT_PASO = 30;

export function parseHora(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Hora invalida: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Hora invalida: ${hhmm}`);
  return h * 60 + min;
}

export function formatHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Partidos por ronda para C clasificados. Los byes no ocupan cancha. */
export function partidosPorRonda(clasificados: number): number[] {
  if (clasificados < 2) return [];
  const bracket = 2 ** Math.ceil(Math.log2(clasificados));
  const out = [clasificados - bracket / 2];
  let n = bracket / 4;
  while (n >= 1) {
    out.push(n);
    n /= 2;
  }
  return out.filter((n, i) => i === 0 || n >= 1);
}

export function tamanoCuadro(clasificados: number): number {
  return clasificados < 2 ? 0 : 2 ** Math.ceil(Math.log2(clasificados));
}

export function byesDelCuadro(clasificados: number): number {
  return clasificados < 2 ? 0 : tamanoCuadro(clasificados) - clasificados;
}

/**
 * Hora mas temprana en que el torneo podria terminar.
 * Para cada j: los partidos a j rondas o mas del final deben caber en las canchas,
 * y despues quedan j rondas encadenadas.
 */
export function cotaInferior(entrada: EntradaScheduler): number {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const desc = entrada.descansoMinimo ?? DEFAULT_DESCANSO_MINIMO;
  const inicio = parseHora(entrada.desde);

  const items: { distancia: number; partidos: number }[] = [];
  for (const cat of entrada.categorias) {
    const rondas = partidosPorRonda(cat.clasificados);
    rondas.forEach((n, i) => {
      items.push({ distancia: rondas.length - 1 - i, partidos: n });
    });
  }
  if (items.length === 0) return inicio;

  const maxDist = Math.max(...items.map((i) => i.distancia));
  let mejor = inicio;
  for (let j = 0; j <= maxDist; j++) {
    const n = items
      .filter((i) => i.distancia >= j)
      .reduce((a, b) => a + b.partidos, 0);
    if (n === 0) continue;
    const t = inicio + Math.ceil(n / entrada.canchas) * dur + j * (dur + desc);
    if (t > mejor) mejor = t;
  }
  return mejor;
}

interface Tarea {
  categoryId: string;
  ronda: number;
  totalRondas: number;
  partidos: number;
  restantes: number;
  colocados: number;
  finMin: number | null;
}

/**
 * Dos categorias son HERMANAS si comparten al menos un jugador.
 *
 * Es la unica nocion de persona que tiene el motor. El resto del scheduler
 * razona en parejas por categoria, que es exactamente por lo que no veia el
 * caso de Cimepa: Santiago Cantillo con semifinal de 2a y final de 3a a las
 * 17:00 no era dos parejas en conflicto — era una persona.
 *
 * Devuelve, por id de categoria, el conjunto de sus hermanas.
 */
function grafoDeHermandad(categorias: CategoriaCuadro[]): Map<string, Set<string>> {
  const porJugador = new Map<string, string[]>();
  for (const c of categorias) {
    for (const j of c.jugadores ?? []) {
      const ya = porJugador.get(j);
      if (ya) ya.push(c.id);
      else porJugador.set(j, [c.id]);
    }
  }

  const hermanas = new Map<string, Set<string>>();
  const une = (a: string, b: string) => {
    if (a === b) return;
    if (!hermanas.has(a)) hermanas.set(a, new Set());
    hermanas.get(a)!.add(b);
  };
  for (const cats of porJugador.values()) {
    if (cats.length < 2) continue;
    for (const a of cats) for (const b of cats) une(a, b);
  }
  return hermanas;
}

/**
 * UNA corrida del planificador. Es el cuerpo que antes era
 * `programarEliminatorias` entero, sin un cambio de logica.
 *
 * ⚠️ Devuelve `finRealista` y `finRealistaUnaCanchaMenos` SIEMPRE en null: una
 * corrida no sabe nada de las otras. Los rellena `programarEliminatorias`.
 * Para mostrarle horas a alguien usa esa; esta es para quien necesita una sola
 * corrida y sabe que la duracion que pasa ya es la realista.
 *
 * Exportada para el planificador (`../planner`), que la llama cientos de veces
 * dentro de su bucle greedy y no puede pagar tres corridas por tentativa.
 */
export function correrCalendario(entrada: EntradaScheduler): Calendario {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const desc = entrada.descansoMinimo ?? DEFAULT_DESCANSO_MINIMO;
  const paso = entrada.paso ?? DEFAULT_PASO;
  const inicio = parseHora(entrada.desde);
  const techo = parseHora(entrada.hasta);
  const avisos: string[] = [];

  if (entrada.canchas < 1) throw new Error('Se necesita al menos una cancha');
  if (techo <= inicio) throw new Error('La ventana termina antes de empezar');
  if (dur < 30 || dur > 120) throw new Error('minutosPorPartido fuera de rango');

  const tareas: Tarea[] = [];
  for (const cat of entrada.categorias) {
    const rondas = partidosPorRonda(cat.clasificados);
    if (rondas.length === 0) {
      avisos.push(`${cat.id} no tiene cuadro: ${cat.clasificados} clasificados.`);
      continue;
    }
    rondas.forEach((n, i) => {
      tareas.push({
        categoryId: cat.id,
        ronda: i + 1,
        totalRondas: rondas.length,
        partidos: n,
        restantes: n,
        colocados: 0,
        finMin: null,
      });
    });
  }

  const totalPartidos = tareas.reduce((a, t) => a + t.partidos, 0);
  const ocupadaHasta: { cancha: number; desde: number; hasta: number }[] = [];
  const partidos: PartidoProgramado[] = [];

  const canchasLibres = (t: number): number[] => {
    const libres: number[] = [];
    for (let c = 0; c < entrada.canchas; c++) {
      const choca = ocupadaHasta.some(
        (o) => o.cancha === c && o.desde < t + dur && t < o.hasta
      );
      if (!choca) libres.push(c);
    }
    return libres;
  };

  const finDe = (categoryId: string, ronda: number): number | null => {
    const t = tareas.find((x) => x.categoryId === categoryId && x.ronda === ronda);
    return t ? t.finMin : null;
  };

  const pendientes = () => tareas.filter((t) => t.restantes > 0);
  const oleadasForzosas = new Set<string>();

  // ── Separacion de hermanas ────────────────────────────────────────────────
  const hermanas = grafoDeHermandad(entrada.categorias);
  const sonHermanas = (a: string, b: string) => hermanas.get(a)?.has(b) ?? false;
  /** Cuantos pasos lleva una tarea apartada por la regla. Clave: cat#ronda. */
  const esperando = new Map<string, number>();
  /** Que categorias ya ocupan cada instante, para detectar el empalme. */
  const enInstante = new Map<number, Set<string>>();
  const empalmes: Calendario['empalmes'] = [];

  for (let t = inicio; t < techo && pendientes().length > 0; t += paso) {
    const listas = pendientes()
      .map((tarea) => {
        let earliest = inicio;
        if (tarea.ronda > 1) {
          const fin = finDe(tarea.categoryId, tarea.ronda - 1);
          if (fin === null) return null;
          earliest = fin + desc;
        }
        if (earliest > t) return null;
        const critico = (tarea.totalRondas - tarea.ronda) * (dur + desc) + dur;
        return { tarea, critico };
      })
      .filter((x): x is { tarea: Tarea; critico: number } => x !== null)
      .sort(
        (a, b) =>
          b.critico - a.critico ||
          b.tarea.partidos - a.tarea.partidos ||
          a.tarea.categoryId.localeCompare(b.tarea.categoryId)
      );

    for (const { tarea } of listas) {
      if (t + dur > techo) break;
      const libres = canchasLibres(t);
      if (libres.length === 0) break;

      const cabeEntera = tarea.partidos <= entrada.canchas;
      if (cabeEntera && tarea.restantes > libres.length) continue;

      // ── ¿Choca con una hermana ya puesta a esta hora? ────────────────────
      // Solo en rondas tempranas (distancia a la final >= 2), donde las rondas
      // van escaladas y apartarse cuesta poco. Semifinales y finales pasan de
      // largo: ahi el motor sigue optimizando la hora sin mirar hermandades.
      const distancia = tarea.totalRondas - tarea.ronda;
      const yaAqui = enInstante.get(t);
      const choca = yaAqui
        ? [...yaAqui].find((otra) => sonHermanas(tarea.categoryId, otra))
        : undefined;

      if (choca && distancia >= DISTANCIA_MINIMA_SEPARACION) {
        const clave = `${tarea.categoryId}#${tarea.ronda}`;
        const espera = (esperando.get(clave) ?? 0) + 1;
        // Preferencia fuerte, no restriccion: pasado el tope se coloca igual.
        // Dejar canchas ociosas indefinidamente es peor que el empalme.
        if (espera <= MAX_ESPERA_POR_EMPALME) {
          esperando.set(clave, espera);
          continue;
        }
      }

      const cupo = Math.min(tarea.restantes, libres.length);
      if (!cabeEntera) oleadasForzosas.add(tarea.categoryId);

      // Se registra TODO empalme entre hermanas, incluidos los de semifinal y
      // final que dejamos pasar a proposito: es el insumo del aviso.
      if (yaAqui) {
        for (const otra of yaAqui) {
          if (!sonHermanas(tarea.categoryId, otra)) continue;
          empalmes.push({
            categoriaA: otra,
            categoriaB: tarea.categoryId,
            hora: formatHora(t),
            etapa: etapaDeRonda(tarea.ronda, tarea.totalRondas),
          });
        }
      }
      if (yaAqui) yaAqui.add(tarea.categoryId);
      else enInstante.set(t, new Set([tarea.categoryId]));

      for (let k = 0; k < cupo; k++) {
        const cancha = libres[k];
        ocupadaHasta.push({ cancha, desde: t, hasta: t + dur });
        partidos.push({
          categoryId: tarea.categoryId,
          ronda: tarea.ronda,
          totalRondas: tarea.totalRondas,
          etapa: etapaDeRonda(tarea.ronda, tarea.totalRondas),
          indiceEnRonda: tarea.colocados + k,
          inicio: formatHora(t),
          inicioMin: t,
          cancha: cancha + 1,
        });
      }
      tarea.colocados += cupo;
      tarea.restantes -= cupo;
      tarea.finMin = t + dur;
    }
  }

  const sinProgramar = tareas.reduce((a, t) => a + t.restantes, 0);
  const cabe = sinProgramar === 0;

  for (const cat of oleadasForzosas) {
    avisos.push(
      `${cat}: la ronda tiene mas partidos que canchas, se juega en oleadas y la mitad del cuadro descansa mas.`
    );
  }

  const ultimoInicioMin =
    partidos.length > 0 ? Math.max(...partidos.map((p) => p.inicioMin)) : null;
  const finEstimadoMin = ultimoInicioMin === null ? null : ultimoInicioMin + dur;
  const cota = cotaInferior(entrada);

  if (cabe && finEstimadoMin !== null && finEstimadoMin > cota) {
    avisos.push(
      `El calendario termina ${formatHora(finEstimadoMin)}; el minimo posible con esta capacidad es ${formatHora(cota)}.`
    );
  }

  const franjas = new Map<number, number>();
  for (const p of partidos) {
    franjas.set(p.inicioMin, (franjas.get(p.inicioMin) ?? 0) + 1);
  }
  const ocupacionPorFranja: FranjaOcupacion[] = [...franjas.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([min, n]) => ({ hora: formatHora(min), canchas: n }));

  let diagnostico: DiagnosticoScheduler | undefined;
  if (!cabe) {
    const horasVentana = (techo - inicio) / 60;
    diagnostico = {
      partidosSinProgramar: sinProgramar,
      canchasQueFaltan: Math.ceil((sinProgramar * dur) / 60 / horasVentana),
      horasQueFaltan: Math.ceil((sinProgramar * dur) / 60 / entrada.canchas),
    };
    avisos.push(
      `No caben ${sinProgramar} partidos antes de ${entrada.hasta}. Reduce repescados, alarga la tarde o suma canchas.`
    );
  }

  return {
    cabe,
    partidos,
    totalPartidos,
    ultimoInicio: ultimoInicioMin === null ? null : formatHora(ultimoInicioMin),
    finEstimado: finEstimadoMin === null ? null : formatHora(finEstimadoMin),
    // Los rellena programarEliminatorias con sus otras dos corridas.
    finRealista: null,
    finRealistaUnaCanchaMenos: null,
    cotaInferior: formatHora(cota),
    ocupacionPorFranja,
    empalmes,
    avisos,
    diagnostico,
  };
}

/**
 * Programa el dia de eliminatorias y dice a que hora termina de verdad.
 *
 * POR QUE TRES CORRIDAS Y NO UNA
 *   Un partido planificado a 60 minutos dura unos 75. En fase de grupos ese
 *   retraso se diluye —los partidos son independientes y se reabsorbe entre
 *   canchas—, pero en eliminatorias NO: las rondas van encadenadas, no se
 *   juega la semifinal antes de los cuartos, y el retraso se suma en linea
 *   recta ronda tras ronda. Un cuadro de 4 rondas acumula una hora entera.
 *
 *   Por eso el organizador necesita un rango. La hora del plan sirve para
 *   ordenar el dia; la realista es la que decide si cabe.
 *
 *   Y la tercera: si el formato solo termina a tiempo usando TODAS las
 *   canchas, una averia el domingo por la manana deja el torneo sin final.
 *   Eso no se ve en ningun porcentaje de ocupacion — hay que simularlo.
 *
 * Solo la primera corrida produce partidos, avisos y diagnostico. De las
 * otras dos se toma la hora y nada mas: sus avisos hablan de una entrada que
 * el organizador no configuro (23:59, otra duracion) y mezclarlos seria
 * contarle cosas de un torneo que no es el suyo.
 */
export function programarEliminatorias(entrada: EntradaScheduler): Calendario {
  // 1) El plan. Es el que manda: partidos, cabe, cota, ocupacion, diagnostico.
  const plan = correrCalendario(entrada);

  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const durReal = Math.round(dur * FACTOR_RETRASO);

  // 2) La realista. El techo se abre a 23:59 A PROPOSITO: la pregunta no es
  //    "cabe en tu ventana" —eso ya lo contesto el plan— sino "a que hora
  //    acabarias". Con el techo del organizador la corrida cortaria partidos
  //    y devolveria una hora falsamente temprana.
  //    El paso baja a 15 para que la rejilla no redondee el retraso hacia
  //    arriba en cada ronda.
  const realista = correrCalendario({
    ...entrada,
    minutosPorPartido: durReal,
    paso: 15,
    hasta: '23:59',
  });

  // 3) Una cancha menos. Con una sola cancha no hay nada que simular.
  const unaMenos = entrada.canchas > 1
    ? correrCalendario({
        ...entrada,
        canchas: entrada.canchas - 1,
        minutosPorPartido: durReal,
        paso: 15,
        hasta: '23:59',
      })
    : null;

  const avisos = [...plan.avisos];

  // El aviso se mide contra el cierre que el organizador SI configuro, no
  // contra el 23:59 de la simulacion.
  const techoReal = parseHora(entrada.hasta);
  if (unaMenos?.finEstimado && parseHora(unaMenos.finEstimado) > techoReal) {
    avisos.push(
      `Con una cancha menos, este formato terminaria a las ${unaMenos.finEstimado}.`
    );
  }

  return {
    ...plan,
    finRealista: realista.finEstimado,
    finRealistaUnaCanchaMenos: unaMenos ? unaMenos.finEstimado : null,
    avisos,
  };
}

/** Valores del enum match_stage de la base para eliminatorias. */
export type EtapaEliminatoria =
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'final';

/**
 * Mapea una ronda del calendario al enum match_stage.
 * Se calcula por distancia a la final, no por numero de ronda,
 * para que funcione igual en cuadros de 4 y de 32.
 */
export function etapaDeRonda(
  ronda: number,
  totalRondas: number
): EtapaEliminatoria {
  const restantes = totalRondas - ronda;
  switch (restantes) {
    case 0:
      return 'final';
    case 1:
      return 'semi';
    case 2:
      return 'quarter';
    case 3:
      return 'round_of_16';
    case 4:
      return 'round_of_32';
    default:
      throw new Error(
        `Cuadro demasiado grande: ronda ${ronda} de ${totalRondas}`
      );
  }
}
