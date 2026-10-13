/**
 * EL DÍA EN CASCADA: cada categoría juega sus grupos y enseguida su cuadro.
 *
 * ► EL PROBLEMA, MEDIDO
 *   Padel Hype: 4 canchas, 32 parejas, un solo día. Los 48 partidos de grupos
 *   llenaban exactamente las doce medias horas de 12:00 a 18:00 y los TRES
 *   cuadros se amontonaban detrás. 5ª Mixto acababa sus grupos a las 15:00 y
 *   jugaba cuartos a las 18:08: tres horas de nada para doce parejas.
 *
 * ► LAS TRES FORMAS, SIMULADAS CON ESE TORNEO
 *   El mismo trabajo —48 partidos de grupos y 17 de cuadro— ordenado de tres
 *   maneras. Lo único que cambia es a quién le toca esperar:
 *
 *     orden                              peor espera   esperas >1 h   en el club
 *     ──────────────────────────────────────────────────────────────────────────
 *     como estaba                           180 min       13 de 98       3,0 h
 *     RONDA A RONDA (las tres a la vez)      90 min       73 de 98       5,9 h
 *     CASCADA (categoría por categoría)      60 min        0 de 98       2,8 h
 *
 *   Ronda a ronda parece lo justo —todos juegan a la vez— y es lo peor de los
 *   tres: con 4 canchas y 8 grupos solo caben DOS grupos por turno, así que la
 *   vuelta completa son cuatro turnos y cada pareja juega cada dos horas. Y
 *   las que no clasifican se van a casa a las ocho en vez de a las tres.
 *
 *   La cascada cuesta media hora de cierre —21:00 en vez de 20:30, que es el
 *   mínimo teórico con 65 partidos y 4 canchas—. A cambio nadie espera más de
 *   una hora y cada categoría pasa por el club menos de tres.
 *
 * ► POR QUÉ NO SE PUDO HACER CON BLOQUES
 *   El carril de un bloque se reserva ENTERO: un cuadro que ocupa 4 canchas el
 *   primer turno, 2 el segundo y 1 el tercero se come un bloque de hora y
 *   media y deja cinco canchas-turno muertas. Tres categorías así alargan el
 *   día tres horas, que es más de lo que ahorran. El reparto en cascada tiene
 *   que ser turno a turno.
 *
 * ► ESTE MOTOR COLOCA LOS GRUPOS; EL CUADRO LO SIGUE PONIENDO EL SUYO
 *   `programarEliminatorias` ya sabe meter cada cuadro en las canchas que la
 *   fase de grupos deja libres (`ocupadas` + `noAntesDe`). Aquí solo se
 *   RESERVAN los turnos que va a necesitar, para que la categoría siguiente no
 *   se los coma: sin esa reserva, los grupos se apilan al principio del día
 *   porque es donde caben, y el cuadro se vuelve a ir al final.
 *
 *   Así un partido movido a mano no descuadra nada: el cuadro se programa
 *   contra lo que de verdad hay escrito, no contra esta simulación.
 *
 * ► SOLO EN TORNEOS DE UN DÍA
 *   En uno de varios, el bloque que eligió la pareja es la única promesa que
 *   se le hizo y vale más que cualquier optimización. Ahí no se toca nada.
 *
 * Módulo puro y determinista: misma entrada, mismo día.
 */

import { parseHora, formatHora, partidosPorRonda } from './knockout';

/** Un partido de grupo tal como lo emitió `generateRoundRobin`. */
export interface PartidoEnCascada {
  matchId: string;
  pairAId: string;
  pairBId: string;
  /** 1-based. Dentro de una ronda ninguna pareja se repite. */
  ronda: number;
}

export interface GrupoEnCascada {
  id: string;
  /** 'A', 'B', … Solo para ordenar de forma estable. */
  nombre: string;
  partidos: PartidoEnCascada[];
}

export interface CategoriaEnCascada {
  id: string;
  grupos: GrupoEnCascada[];
  /** Tamaño del cuadro. De aquí salen los turnos que hay que reservarle. */
  clasificados: number;
}

export interface EntradaCascada {
  canchas: number;
  /** 'HH:MM'. La ventana del día. */
  desde: string;
  hasta: string;
  minutosPorPartido: number;
  categorias: CategoriaEnCascada[];
}

export interface PartidoColocado {
  matchId: string;
  groupId: string;
  categoryId: string;
  inicio: string;
  inicioMin: number;
  /** 1..canchas. */
  cancha: number;
}

/** Lo que el día le reserva al cuadro de una categoría. */
export interface HuecoDeCuadro {
  categoryId: string;
  desdeMin: number;
  hastaMin: number;
  turnos: number;
}

export interface PlanCascada {
  partidos: PartidoColocado[];
  /** Partidos de grupo que no cupieron en la ventana. */
  sinColocar: string[];
  /** Las categorías en el orden en que entran al club. */
  orden: string[];
  huecos: HuecoDeCuadro[];
  /** Minuto en que acaba el último partido —de grupo o de cuadro— del día. */
  finMin: number | null;
  avisos: string[];
}

/**
 * Turnos que necesita el cuadro de una categoría.
 *
 * Una ronda de 4 partidos en 4 canchas es UN turno; en 2 canchas, dos. Las
 * rondas se suman porque van encadenadas: la semifinal no empieza hasta que
 * acaban los cuartos.
 */
export function turnosDeCuadro(clasificados: number, canchas: number): number {
  return partidosPorRonda(clasificados)
    .reduce((a, n) => a + Math.ceil(n / Math.max(1, canchas)), 0);
}

/** Los partidos de un grupo, agrupados por ronda y en orden. */
function porRonda(partidos: PartidoEnCascada[]): PartidoEnCascada[][] {
  const rondas = [...new Set(partidos.map((p) => p.ronda))].sort((a, b) => a - b);
  return rondas.map((r) => partidos.filter((p) => p.ronda === r));
}

/**
 * El día entero, categoría por categoría.
 *
 * ► EL ORDEN: LA CATEGORÍA MÁS GRANDE PRIMERO
 *   Es la que más canchas simultáneas necesita, así que entra cuando el club
 *   está vacío. Dejarla para el final la obliga a repartirse en más turnos, y
 *   es justo la que más gente mueve. Se desempata por id para que el mismo
 *   torneo dé siempre el mismo día.
 *
 * ► LA CATEGORÍA SIGUIENTE EMPIEZA EN CUANTO SOBRA UNA CANCHA
 *   No espera a que la anterior termine. Mientras 5ª Mixto juega su final en
 *   una cancha, las otras tres ya son de 6ª: así la cascada cuesta media hora
 *   y no tres. Lo que NO puede hacer es meterse en los turnos reservados al
 *   cuadro de la anterior.
 */
export function planearDiaEnCascada(entrada: EntradaCascada): PlanCascada {
  const { canchas, minutosPorPartido: dur } = entrada;
  const inicio = parseHora(entrada.desde);
  const techo = parseHora(entrada.hasta);
  const avisos: string[] = [];

  if (canchas < 1) throw new Error('Se necesita al menos una cancha');
  if (techo <= inicio) throw new Error('La ventana termina antes de empezar');
  if (dur < 15 || dur > 120) throw new Error('minutosPorPartido fuera de rango');

  const orden = [...entrada.categorias]
    .sort((a, b) => b.grupos.length - a.grupos.length || a.id.localeCompare(b.id))
    .map((c) => c.id);
  const puesto = new Map(orden.map((id, i) => [id, i]));

  /** Cada partido con lo que hace falta para decidir cuándo entra. */
  interface Tarea {
    partido: PartidoEnCascada;
    groupId: string;
    categoryId: string;
    /** Orden dentro de su categoría: ronda primero, luego grupo. */
    peso: number;
    rondaDelGrupo: number;
    colocadoEn: number | null;
  }
  const tareas: Tarea[] = [];
  for (const cat of entrada.categorias) {
    const grupos = [...cat.grupos].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id));
    grupos.forEach((g, gi) => {
      porRonda(g.partidos).forEach((ronda, ri) => {
        for (const p of ronda) {
          tareas.push({
            partido: p, groupId: g.id, categoryId: cat.id,
            // La ronda manda sobre el grupo: dentro de una categoría conviene
            // que los grupos avancen a la par, no uno entero y luego otro.
            peso: ri * 100 + gi,
            rondaDelGrupo: ri,
            colocadoEn: null,
          });
        }
      });
    });
  }

  const partidos: PartidoColocado[] = [];
  const huecos: HuecoDeCuadro[] = [];
  /**
   * Canchas reservadas en cada turno para el cuadro de alguna categoría.
   *
   * SE RESERVAN CANCHAS, NO TURNOS ENTEROS. Una final ocupa UNA cancha: vedar
   * las otras tres ese turno alargaba el día una hora entera y no servía de
   * nada. Mientras 5ª Mixto juega su final en la cancha 1, las otras tres ya
   * son de la categoría siguiente.
   */
  const reservados = new Map<number, number>();
  /** pareja -> último turno en que jugó. Nadie juega dos partidos a la vez. */
  const ocupadaEn = new Map<string, number>();
  /** Categoría -> turno en que acabó su último partido de grupos. */
  const finDeGrupos = new Map<string, number>();

  const pendientes = () => tareas.filter((t) => t.colocadoEn === null);

  /**
   * Las categorías que acaban de terminar sus grupos piden su hueco.
   *
   * Se llama en cada turno Y una vez al salir del bucle: la última categoría
   * termina justo cuando ya no quedan partidos que colocar, y sin esa llamada
   * final se quedaba sin cuadro reservado.
   */
  const reservarLosQueTerminaron = () => {
    for (const cat of entrada.categorias) {
      if (finDeGrupos.has(cat.id)) continue;
      const suyas = tareas.filter((x) => x.categoryId === cat.id);
      if (suyas.length === 0 || suyas.some((x) => x.colocadoEn === null)) continue;
      const fin = Math.max(...suyas.map((x) => x.colocadoEn!)) + dur;
      finDeGrupos.set(cat.id, fin);
      // Cuántas canchas pide cada turno del cuadro: 4 los cuartos, 2 las
      // semis, 1 la final. Una ronda más ancha que el club ocupa varios turnos.
      let turno = 0;
      for (const n of partidosPorRonda(cat.clasificados)) {
        let quedan = n;
        while (quedan > 0) {
          const pide = Math.min(quedan, canchas);
          const t0 = fin + turno * dur;
          reservados.set(t0, Math.min(canchas, (reservados.get(t0) ?? 0) + pide));
          quedan -= pide;
          turno++;
        }
      }
      const turnos = turno;
      huecos.push({ categoryId: cat.id, desdeMin: fin, hastaMin: fin + turnos * dur, turnos });
    }
  };

  for (let t = inicio; t < techo && pendientes().length > 0; t += dur) {
    reservarLosQueTerminaron();

    let libres = canchas - (reservados.get(t) ?? 0);
    const jugando = new Set<string>();

    const listas = pendientes()
      .filter((x) => {
        // La ronda anterior de SU grupo tiene que haber acabado.
        return !tareas.some((y) => y.groupId === x.groupId
          && y.rondaDelGrupo < x.rondaDelGrupo
          && (y.colocadoEn === null || y.colocadoEn >= t));
      })
      .sort((a, b) =>
        (puesto.get(a.categoryId)! - puesto.get(b.categoryId)!)
        || (a.peso - b.peso)
        || a.partido.matchId.localeCompare(b.partido.matchId));

    for (const x of listas) {
      if (libres === 0) break;
      const { pairAId, pairBId } = x.partido;
      if (jugando.has(pairAId) || jugando.has(pairBId)) continue;
      if (t + dur > techo) break;
      x.colocadoEn = t;
      jugando.add(pairAId); jugando.add(pairBId);
      ocupadaEn.set(pairAId, t); ocupadaEn.set(pairBId, t);
      partidos.push({
        matchId: x.partido.matchId,
        groupId: x.groupId,
        categoryId: x.categoryId,
        inicio: formatHora(t),
        inicioMin: t,
        // Las canchas del cuadro se cuentan desde la 1: los grupos se ponen
        // en las de arriba para no partirle la fila a nadie.
        cancha: canchas - libres + 1,
      });
      libres--;
    }
  }

  reservarLosQueTerminaron();

  const sinColocar = pendientes().map((x) => x.partido.matchId);
  if (sinColocar.length > 0) {
    avisos.push(
      `${sinColocar.length} partido${sinColocar.length === 1 ? '' : 's'} de grupos no cabe${sinColocar.length === 1 ? '' : 'n'} ` +
      'en el día: con las categorías jugando una detrás de otra hacen falta más horas o más canchas.',
    );
  }

  // El fin del día es el del último CUADRO, no el del último grupo: la final
  // de la última categoría es lo que de verdad cierra el club.
  const finGrupos = partidos.length > 0 ? Math.max(...partidos.map((p) => p.inicioMin)) + dur : null;
  const finCuadros = huecos.length > 0 ? Math.max(...huecos.map((h) => h.hastaMin)) : null;
  const finMin = finGrupos === null ? finCuadros
    : finCuadros === null ? finGrupos
    : Math.max(finGrupos, finCuadros);

  if (finMin !== null && finMin > techo) {
    avisos.push(
      `El día se sale de la ventana: termina a las ${formatHora(finMin)} y el club cierra a las ${entrada.hasta}.`,
    );
  }

  return { partidos, sinColocar, orden, huecos, finMin, avisos };
}
