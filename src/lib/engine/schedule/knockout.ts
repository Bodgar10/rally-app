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
  /**
   * ¿Se juega el partido por el 3.er lugar? Default true.
   *
   * Es una decisión de TORNEO, no de categoría: o se juega en todas o en
   * ninguna. Cuenta para el presupuesto porque ocupa una cancha, y lo hace en
   * el peor momento —a la vez que las finales, cuando las ocho categorías
   * convergen— así que ignorarlo era subestimar justo la hora más cargada.
   */
  tercerLugar?: boolean;
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
/**
 * @deprecated Ya no es el paso por defecto: la reticula vale lo que dura un
 * partido (ver `correrCalendario`). Se conserva porque hay entradas guardadas
 * que lo pasan explicitamente.
 */
export const DEFAULT_PASO = 30;

export function parseHora(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Hora invalida: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Hora invalida: ${hhmm}`);
  return h * 60 + min;
}

/**
 * Minutos desde medianoche -> 'HH:MM', envolviendo pasada la medianoche.
 *
 * `1470` son las 00:30 del día siguiente, no las «24:30». Un día con retrasos
 * puede pasar de las 24 h y la pantalla llegó a enseñar "hasta las 24:30", que
 * no es una hora que exista y le dice al organizador que el cálculo está roto
 * aunque no lo esté.
 *
 * No se marca de qué día es: quien llama ya sabe que es el mismo día que
 * empezó, y añadir un "+1" aquí obligaría a todos los sitios que solo quieren
 * la hora a limpiarlo.
 */
export function formatHora(min: number): string {
  const enElDia = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(enElDia / 60);
  const m = enElDia % 60;
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

/**
 * ¿Esta categoría juega el 3.er lugar?
 *
 * Hacen falta DOS perdedores de semifinal. Con 3 clasificados una de las dos
 * semifinales es un bye, así que solo pierde una pareja y no hay partido que
 * jugar — `thirdPlaceFromSemis` devuelve null y hace bien. Desde 4 clasificados
 * las dos semifinales son reales.
 */
export function hayTercerLugar(clasificados: number, activo: boolean): boolean {
  return activo && clasificados >= 4;
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
/** 'semi' -> 'semifinal'. Para que el aviso se lea como una frase. */
function etiquetaEtapa(etapa: string): string {
  const M: Record<string, string> = {
    round_of_32: 'ronda de 32', round_of_16: 'ronda de 16', quarter: 'ronda de cuartos',
    semi: 'semifinal', final: 'final', third_place: 'final de 3.er lugar',
  };
  return M[etapa] ?? etapa;
}

export function cotaInferior(entrada: EntradaScheduler): number {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const paso = entrada.paso ?? dur;
  const inicio = parseHora(entrada.desde);

  /**
   * La cota tiene que caer en la RETICULA, o promete una hora que ningun plan
   * puede dar. Con partidos de 60 alineados a la hora en punto, un minimo
   * teorico de 20:30 no es alcanzable: no existe el hueco de las 19:30. Sin
   * redondear, el motor se avisaba a si mismo de que no llegaba a un minimo
   * imposible por construccion, en cada corrida y para siempre.
   */
  const enLaReticula = (t: number) =>
    t <= inicio ? inicio : inicio + Math.ceil((t - inicio) / paso) * paso;

  const tercerLugar = entrada.tercerLugar ?? true;
  const items: { distancia: number; partidos: number }[] = [];
  for (const cat of entrada.categorias) {
    const rondas = partidosPorRonda(cat.clasificados);
    rondas.forEach((n, i) => {
      items.push({ distancia: rondas.length - 1 - i, partidos: n });
    });
    // El 3.er lugar entra a distancia 0 —la misma que la final— porque ocupa
    // cancha en esa oleada. No alarga la cadena, pero sin contarlo la cota
    // prometía una hora que las canchas no dan, y el plan quedaba avisando de
    // que no alcanzaba un mínimo que era falso.
    if (hayTercerLugar(cat.clasificados, tercerLugar)) {
      items.push({ distancia: 0, partidos: 1 });
    }
  }
  if (items.length === 0) return inicio;

  const maxDist = Math.max(...items.map((i) => i.distancia));
  let mejor = inicio;
  for (let j = 0; j <= maxDist; j++) {
    const n = items
      .filter((i) => i.distancia >= j)
      .reduce((a, b) => a + b.partidos, 0);
    if (n === 0) continue;
    // El ultimo partido de la cadena EMPIEZA en un hueco de la reticula; la
    // hora de fin es ese hueco mas la duracion.
    // Sin `desc` en la cadena: el descanso es una preferencia, no un muro, asi
    // que no puede figurar en el MINIMO teorico. Si figurara, la cota
    // prometeria una hora peor que la que el plan de verdad alcanza.
    const arranqueUltimo = inicio + Math.ceil(n / entrada.canchas) * dur + j * dur - dur;
    const t = enLaReticula(arranqueUltimo) + dur;
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
  /**
   * El 3.er lugar. Va a la MISMA profundidad que la final —los dos dependen de
   * las semifinales y ninguno del otro— pero con su propia etapa, no fundido en
   * la ronda final: `schedule-knockout` empareja plan y base por
   * (categoría, stage), y dos slots de 'final' contra un solo partido de final
   * en la base le harían saltar el aviso de descuadre y saltarse la categoría
   * entera.
   */
  tercerLugar?: boolean;
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
export function grafoDeHermandad(categorias: CategoriaCuadro[]): Map<string, Set<string>> {
  const porJugador = new Map<string, string[]>();
  for (const c of categorias) {
    for (const j of c.jugadores ?? []) {
      // Un id vacío NO es una persona. Sin este filtro, dos categorías con una
      // pareja a medio inscribir "comparten jugador": el motor las separa en
      // el tiempo, alarga el domingo y avisa de un empalme que no existe.
      if (!j) continue;
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
  // LA RETICULA VALE LO QUE DURA UN PARTIDO, NO LA MITAD.
  //
  //   Era 30 con partidos de 60. Eso no adelantaba nada: una ronda solo entra
  //   cuando se libera una cancha, y una cancha se libera al terminar un
  //   partido, o sea cada 60 minutos. Lo unico que anadia el paso de 30 era
  //   colocar rondas a las 18:30 —cuando la oleada anterior liberaba canchas a
  //   media hora del resto— y a partir de ahi el dia entero quedaba desfasado:
  //   ese partido termina a las 19:30 y arrastra a los suyos.
  //
  //   Un torneo de padel programa a las 18:00 o a las 19:00. Nunca a las 18:30.
  const paso = entrada.paso ?? dur;
  const inicio = parseHora(entrada.desde);
  const techo = parseHora(entrada.hasta);
  const tercerLugar = entrada.tercerLugar ?? true;
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

    // El 3.er lugar entra como tarea aparte a la altura de la final: depende de
    // las semifinales igual que ella, así que puede correr en paralelo si hay
    // cancha. No alarga la cadena; ocupa una pista más en el momento en que
    // todas las categorías convergen.
    if (hayTercerLugar(cat.clasificados, tercerLugar)) {
      tareas.push({
        categoryId: cat.id,
        ronda: rondas.length,
        totalRondas: rondas.length,
        partidos: 1,
        restantes: 1,
        colocados: 0,
        finMin: null,
        tercerLugar: true,
      });
    }
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

  // La final y el 3.er lugar comparten número de ronda, así que hay que pedir
  // explícitamente la del cuadro: si no, la dependencia de la final podría
  // resolverse contra el 3.er lugar y viceversa.
  const finDe = (categoryId: string, ronda: number): number | null => {
    const t = tareas.find(
      (x) => x.categoryId === categoryId && x.ronda === ronda && !x.tercerLugar,
    );
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
  /**
   * Rondas que arrancan con menos descanso del deseable.
   *
   * No es un error ni un rechazo: es el precio de cerrar antes, y el
   * organizador tiene derecho a verlo con nombre y apellidos antes de publicar
   * el calendario. El algoritmo informa; no bloquea.
   */
  const sinDescanso: { categoryId: string; etapa: string; minutos: number }[] = [];

  for (let t = inicio; t < techo && pendientes().length > 0; t += paso) {
    const listas = pendientes()
      .map((tarea) => {
        let earliest = inicio;
        if (tarea.ronda > 1) {
          const fin = finDe(tarea.categoryId, tarea.ronda - 1);
          if (fin === null) return null;
          // EL DESCANSO NO ES UN MURO. Lo unico que de verdad impide jugar la
          // ronda siguiente es que la anterior no haya TERMINADO.
          //
          //   Era `fin + desc`, y eso bloqueaba canchas vacias: las semis
          //   acababan a las 18:00, habia dos canchas libres, y la final se
          //   iba a las 19:00 porque el motor exigia media hora de descanso
          //   que en un torneo de padel no existe. Los jugadores juegan
          //   seguido; el respiro que se ve en octavos y cuartos es
          //   consecuencia de que no hay canchas para encadenar, no una regla.
          //   Y de semifinal a final SIEMPRE es seguido.
          //
          //   El descanso sigue vivo como PREFERENCIA (ver `conDescanso`):
          //   se coge el hueco holgado cuando sale gratis y se sacrifica en
          //   cuanto cuesta un minuto de cierre. Donde se sacrifique, se dice.
          earliest = fin;
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
            etapa: tarea.tercerLugar ? 'third_place' : etapaDeRonda(tarea.ronda, tarea.totalRondas),
          });
        }
      }
      if (yaAqui) yaAqui.add(tarea.categoryId);
      else enInstante.set(t, new Set([tarea.categoryId]));

      // ¿Esta ronda arranca pegada a la anterior? Se anota una vez por ronda.
      if (tarea.ronda > 1 && tarea.colocados === 0) {
        const finPrevia = finDe(tarea.categoryId, tarea.ronda - 1);
        if (finPrevia !== null && t - finPrevia < desc) {
          sinDescanso.push({
            categoryId: tarea.categoryId,
            etapa: tarea.tercerLugar ? 'third_place' : etapaDeRonda(tarea.ronda, tarea.totalRondas),
            minutos: t - finPrevia,
          });
        }
      }

      for (let k = 0; k < cupo; k++) {
        const cancha = libres[k];
        ocupadaHasta.push({ cancha, desde: t, hasta: t + dur });
        partidos.push({
          categoryId: tarea.categoryId,
          ronda: tarea.ronda,
          totalRondas: tarea.totalRondas,
          etapa: tarea.tercerLugar ? 'third_place' : etapaDeRonda(tarea.ronda, tarea.totalRondas),
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

  // Con nombres, no un contador: el organizador tiene que poder mirar a quien
  // le toca encadenar y decidir si lo deja o mueve algo.
  for (const d of sinDescanso) {
    avisos.push(
      d.minutos === 0
        ? `${d.categoryId}: la ${etiquetaEtapa(d.etapa)} empieza justo despues de la ronda anterior, sin descanso.`
        : `${d.categoryId}: la ${etiquetaEtapa(d.etapa)} empieza ${d.minutos} min despues de la ronda anterior, ` +
          `menos de los ${desc} de descanso deseable.`,
    );
  }

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

/** Lo que hace falta saber de una categoria para estirar su cadena. */
export interface CadenaCategoria {
  categoryId: string;
  /** Cuantas rondas encadenadas juega. */
  rondas: number;
  /** Minuto de inicio de su ULTIMO partido, segun el plan. */
  ultimoInicioMin: number;
}

/**
 * A que hora termina de verdad un calendario ya planificado.
 *
 * SE ESTIRA LA CADENA, NO EL DIA.
 *   Un partido de 60 minutos dura unos 75. Ese 25% no se reparte por igual:
 *
 *   · Estirar el dia entero por 1.25 SOBREESTIMA. Mete en la cuenta los huecos
 *     ociosos, y un hueco no se retrasa — absorbe retraso. Una cancha vacia a
 *     las 15:00 es margen, no deuda.
 *
 *   · Replanificar con partidos de 75 minutos SUBESTIMA. Recompacta el dia
 *     asumiendo una reoptimizacion que nadie hace un domingo a media tarde:
 *     los partidos ya tienen hora y la gente ya la sabe.
 *
 *   Lo que de verdad se acumula es la CADENA de cada categoria: la semifinal no
 *   empieza hasta que acaban los cuartos, asi que cada ronda hereda el retraso
 *   de la anterior. Con R rondas, esa categoria termina R x dur x 0.25 mas
 *   tarde de lo planificado. El torneo acaba cuando acaba la ultima.
 *
 * Devuelve minutos, o null si no hay nada que estirar.
 */
export function finRealistaEncadenado(
  cadenas: CadenaCategoria[],
  minutosPorPartido: number,
): number | null {
  if (cadenas.length === 0) return null;
  const exceso = minutosPorPartido * (FACTOR_RETRASO - 1);
  let peor = -1;
  for (const c of cadenas) {
    const fin = c.ultimoInicioMin + minutosPorPartido + Math.round(c.rondas * exceso);
    if (fin > peor) peor = fin;
  }
  return peor < 0 ? null : peor;
}

/** Las cadenas que se deducen de un calendario ya programado. */
export function cadenasDePartidos(partidos: PartidoProgramado[]): CadenaCategoria[] {
  const m = new Map<string, CadenaCategoria>();
  for (const p of partidos) {
    const ya = m.get(p.categoryId);
    if (ya) {
      ya.rondas = Math.max(ya.rondas, p.totalRondas);
      ya.ultimoInicioMin = Math.max(ya.ultimoInicioMin, p.inicioMin);
    } else {
      m.set(p.categoryId, {
        categoryId: p.categoryId,
        rondas: p.totalRondas,
        ultimoInicioMin: p.inicioMin,
      });
    }
  }
  return [...m.values()];
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

  // 2) La realista. NO se replanifica a otra duracion: se estira la cadena del
  //    plan. Ver finRealistaEncadenado — replanificar con partidos de 75
  //    minutos recompactaria el dia y daria una hora que nadie va a ver,
  //    porque a media tarde el calendario ya no se reoptimiza.
  //
  //    Si el plan NO cabe esta truncado —le faltan los partidos que no
  //    entraron—, y estirar esa cadena daria una hora falsamente temprana: la
  //    de terminar un torneo a medias. En ese caso se replantea con el techo
  //    abierto, para responder "a que hora acabarias si los jugaras todos".
  const paraCadena = plan.cabe
    ? plan
    : correrCalendario({ ...entrada, hasta: '23:59' });
  const realMin = finRealistaEncadenado(cadenasDePartidos(paraCadena.partidos), dur);

  // 3) Una cancha menos. Se REPLANIFICA —eso si cambia el plan: con una
  //    cancha menos los partidos caen en otras horas— y sobre ESE plan se
  //    estira la cadena, con la misma formula. El techo se abre a 23:59 a
  //    proposito: la pregunta no es "cabe" sino "a que hora acabarias", y con
  //    el techo del organizador la corrida cortaria partidos y devolveria una
  //    hora falsamente temprana.
  //    Con una sola cancha no hay nada que simular.
  const unaMenos = entrada.canchas > 1
    ? correrCalendario({ ...entrada, canchas: entrada.canchas - 1, hasta: '23:59' })
    : null;
  const unaMenosMin = unaMenos
    ? finRealistaEncadenado(cadenasDePartidos(unaMenos.partidos), dur)
    : null;

  const avisos = [...plan.avisos];

  // El aviso se mide contra el cierre que el organizador SI configuro, no
  // contra el 23:59 de la simulacion.
  const techoReal = parseHora(entrada.hasta);

  // EL AVISO QUE FALTABA, Y ES EL QUE IMPORTA.
  //
  //   `cabe` se mide contra `finEstimado`, que supone que ningun partido se
  //   pasa de los 60 minutos. En el domingo de bb8e137e eso daba `cabe: true`
  //   con cierre 20:30 dentro de una ventana que acaba a las 21:00 — y la hora
  //   REALISTA era 21:15, quince minutos DESPUES del cierre. El organizador
  //   leia "cabe" y se iba tranquilo.
  //
  //   Se avisaba de la cancha caida, que es la hipotesis, y no del caso base,
  //   que es la certeza.
  //
  //   PERO ES UN ESCENARIO, NO EL VEREDICTO. El plan se hace con la duracion
  //   NOMINAL y `cabe` se decide contra el, no contra la proyeccion: dar por
  //   hecho que todos los partidos se alargan seria planificar el peor caso
  //   como si fuera el unico, y ademas se comeria la ventana de todos los
  //   torneos que van bien. Se dice lo que pasaria; no se dice que no cabe.
  if (realMin !== null && realMin > techoReal) {
    avisos.push(
      `Escenario con retrasos: si todos los partidos se alargaran, el dia acabaria a las ` +
      `${formatHora(realMin)}, pasado el cierre de las ${entrada.hasta}. ` +
      `El plan nominal cierra a las ${plan.finEstimado} y si cabe.`
    );
  }

  // Y SI ADEMAS EL PLAN YA ES OPTIMO, decirlo, porque cambia la accion.
  //
  //   Un organizador que ve huecos al final del dia vuelve a darle a
  //   Reprogramar esperando que se compacten. No se van a compactar: la cola
  //   fina del final es la cadena del cuadro —cada final espera a SU semifinal
  //   mas el descanso— y no hay con que rellenarla porque ya no queda nada por
  //   jugar en paralelo. Cuando el plan iguala la cota inferior, reprogramar no
  //   puede dar nada mejor y las palancas son otras: mas canchas, partidos mas
  //   cortos, o empezar el cuadro el dia anterior.
  const finPlanMin = plan.ultimoInicio === null ? null : parseHora(plan.ultimoInicio) + dur;
  if (plan.cabe && finPlanMin !== null && finPlanMin <= parseHora(plan.cotaInferior)) {
    avisos.push(
      `Este calendario ya es el mas corto posible con ${entrada.canchas} canchas y partidos de ` +
      `${dur} minutos: reprogramar no lo va a acortar. Los huecos del final son la cadena del ` +
      `cuadro, no tiempo desaprovechado.`
    );
  }

  if (unaMenosMin !== null && unaMenosMin > techoReal) {
    avisos.push(
      `Con una cancha menos, este formato terminaria a las ${formatHora(unaMenosMin)}.`
    );
  }

  return {
    ...plan,
    finRealista: realMin === null ? null : formatHora(realMin),
    finRealistaUnaCanchaMenos: unaMenosMin === null ? null : formatHora(unaMenosMin),
    avisos,
  };
}

/** Valores del enum match_stage de la base para eliminatorias. */
export type EtapaEliminatoria =
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'final'
  // Cuelga del árbol en vez de estar dentro: sale de los dos perdedores de
  // semifinal, no de un ganador. `etapaDeRonda` nunca lo devuelve; lo pone
  // `correrCalendario` en la tarea que reserva su cancha.
  | 'third_place';

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
