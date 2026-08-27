/**
 * Scheduler de eliminatorias.
 * Asigna hora y cancha a cada partido del último día del torneo.
 * Lógica pura y determinista: misma entrada -> misma salida. Sin dependencias.
 */

export interface CategoriaCuadro {
  id: string;
  clasificados: number;
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
  finEstimado: string | null;
  cotaInferior: string;
  ocupacionPorFranja: FranjaOcupacion[];
  avisos: string[];
  diagnostico?: DiagnosticoScheduler;
}

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

export function programarEliminatorias(entrada: EntradaScheduler): Calendario {
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

      const cupo = Math.min(tarea.restantes, libres.length);
      if (!cabeEntera) oleadasForzosas.add(tarea.categoryId);

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
    cotaInferior: formatHora(cota),
    ocupacionPorFranja,
    avisos,
    diagnostico,
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
