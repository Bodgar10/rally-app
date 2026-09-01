/**
 * RALLY · Empalmes del calendario: quién no puede estar en dos canchas a la vez
 *
 * EL BUG QUE ESTE ARCHIVO EXISTE PARA NO REPETIR
 *   El detector vivía dentro de `calendario.tsx` y agrupaba por
 *   `jugadorId + hora del reloj`. Sin el día.
 *
 *   En el torneo bb8e137e eso produjo el aviso "15:00 · Luis Flores — cuartos
 *   de 6ª Varonil y grupos de 6ª Varonil": los cuartos son del DOMINGO y los
 *   grupos del SÁBADO. Ese empalme no existe. Y como el par (jugador, hora) ya
 *   estaba ocupado por el falso, los DOS empalmes reales del sábado —15:00 y
 *   16:00, cancha 7 contra cancha 5— no se reportaron nunca.
 *
 *   Un aviso falso que además tapa los verdaderos es peor que no avisar: el
 *   organizador aprende a ignorar la sección entera.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN
 *   1. Se compara el INSTANTE (`instanteDeTorneo`), nunca el texto de la hora.
 *   2. Un partido sin hora NO es un empalme y NO ocupa a nadie. Se excluye
 *      explícitamente antes de comparar; no se confía en que la comparación
 *      falle sola. Un `null` que se cuela en un `Map` es una clave más.
 *
 * Y NO SE RESUELVE NADA AQUÍ. El motor informa, el organizador decide: quién
 * espera, o si alguien pierde por default. Esto solo tiene que detectar bien.
 */

import { diaDeTorneo, diaYHoraDeTorneo, instanteDeTorneo } from '@/lib/fechas';

/** Un partido, con lo justo para saber si empalma. */
export interface PartidoParaEmpalmes {
  id: string;
  categoriaId: string;
  /** Nombre visible: '6ª Varonil'. */
  categoria: string;
  /** Nombre visible de la fase: 'grupos', 'cuartos', 'final'. */
  etapa: string;
  /** `scheduled_at` crudo. Null mientras no tenga hora. */
  iso: string | null;
  /**
   * Los CUATRO jugadores: los dos de la pareja A y los dos de la pareja B.
   *
   * Media lista es media detección. Un partido en el que solo se miran los
   * jugadores de la pareja A deja fuera a la mitad del cuadro, y los empalmes
   * de esa mitad no los ve nadie.
   */
  jugadores: string[];
}

export interface EmpalmeReal {
  /** Nombre del jugador, para poder escribirle. */
  jugador: string;
  jugadorId: string;
  /** 'sáb 5, 15:00'. Con el día: una hora suelta no identifica nada. */
  cuando: string;
  /** 'YYYY-MM-DD' en la zona del club, para saltar a la celda. */
  dia: string;
  /** 'grupos de 6ª Varonil y grupos de 2ª Varonil'. */
  detalle: string;
  /** Uno de los partidos en conflicto, para navegar hasta él. */
  matchId: string;
}

/** Partidos de una misma categoría y fase a los que les falta la hora. */
export interface FaltaHora {
  categoriaId: string;
  categoria: string;
  etapa: string;
  partidos: number;
  texto: string;
}

/** Los cuatro jugadores, sin ids vacíos ni repetidos. */
function jugadoresLimpios(p: PartidoParaEmpalmes): string[] {
  return [...new Set((p.jugadores ?? []).filter((j): j is string => !!j))];
}

/**
 * Los partidos que SÍ se pueden comparar: los que tienen un instante real.
 *
 * Explícito y en un solo sitio. Antes el filtro era implícito —"si no tiene
 * hora, la comparación no casará"— y eso es exactamente lo que no hay que dar
 * por supuesto: `undefined === undefined` es `true`, y dos partidos sin hora
 * habrían empalmado entre sí.
 */
function conInstante(
  partidos: PartidoParaEmpalmes[],
): { p: PartidoParaEmpalmes; instante: number }[] {
  const out: { p: PartidoParaEmpalmes; instante: number }[] = [];
  for (const p of partidos) {
    const instante = instanteDeTorneo(p.iso);
    if (instante === null) continue;
    out.push({ p, instante });
  }
  return out;
}

/**
 * Un jugador con dos partidos EN EL MISMO INSTANTE.
 *
 * Determinista: el orden de salida es por instante y luego por nombre, no por
 * el orden en que llegaron los partidos.
 */
export function empalmesReales(
  partidos: PartidoParaEmpalmes[],
  nombrePorId: Map<string, string>,
): EmpalmeReal[] {
  // Clave: jugador + instante exacto. El instante, no la hora del reloj.
  const porJugadorInstante = new Map<string, PartidoParaEmpalmes[]>();

  for (const { p, instante } of conInstante(partidos)) {
    for (const j of jugadoresLimpios(p)) {
      const clave = `${j}#${instante}`;
      const ya = porJugadorInstante.get(clave);
      if (ya) ya.push(p);
      else porJugadorInstante.set(clave, [p]);
    }
  }

  const out: EmpalmeReal[] = [];
  for (const [clave, choque] of porJugadorInstante) {
    if (choque.length < 2) continue;
    const corte = clave.lastIndexOf('#');
    const jugadorId = clave.slice(0, corte);
    // Se ordenan los partidos del choque para que el detalle no dependa del
    // orden de lectura: "grupos de 2ª y grupos de 6ª" siempre igual.
    const enOrden = [...choque].sort(
      (a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.etapa.localeCompare(b.etapa, 'es'),
    );
    out.push({
      jugador: nombrePorId.get(jugadorId) ?? 'Un jugador',
      jugadorId,
      cuando: diaYHoraDeTorneo(enOrden[0].iso),
      dia: diaDeTorneo(enOrden[0].iso),
      // Cada partido con SU fase y SU categoría. El detalle decía "cuartos" de
      // los dos lados porque el partido de muestra salía del grupo equivocado.
      detalle: enOrden.map((c) => `${c.etapa} de ${c.categoria}`).join(' y '),
      matchId: enOrden[0].id,
    });
  }

  return out.sort(
    (a, b) =>
      a.cuando.localeCompare(b.cuando) ||
      a.jugador.localeCompare(b.jugador, 'es') ||
      a.jugadorId.localeCompare(b.jugadorId),
  );
}

/**
 * Los partidos SIN hora, agrupados por categoría y fase.
 *
 * NO PUEDEN DESAPARECER EN SILENCIO. Excluirlos del detector es correcto —sin
 * hora no hay empalme que detectar— pero si además no se dicen, la pantalla
 * enseña un calendario que parece completo y no lo está, y el organizador se
 * entera el día del torneo. Es un aviso DISTINTO del de empalmes: aquí no hay
 * un choque, hay un dato que falta.
 */
export function partidosSinHora(partidos: PartidoParaEmpalmes[]): FaltaHora[] {
  const porGrupo = new Map<string, FaltaHora>();

  for (const p of partidos) {
    if (instanteDeTorneo(p.iso) !== null) continue;
    const clave = `${p.categoriaId}#${p.etapa}`;
    const ya = porGrupo.get(clave);
    if (ya) { ya.partidos++; continue; }
    porGrupo.set(clave, {
      categoriaId: p.categoriaId,
      categoria: p.categoria,
      etapa: p.etapa,
      partidos: 1,
      texto: '',
    });
  }

  return [...porGrupo.values()]
    .map((f) => ({
      ...f,
      texto:
        `${f.partidos} partido${f.partidos === 1 ? '' : 's'} de ${f.etapa} ` +
        `de ${f.categoria} no tiene${f.partidos === 1 ? '' : 'n'} hora asignada`,
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.etapa.localeCompare(b.etapa, 'es'));
}
