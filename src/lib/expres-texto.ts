/**
 * RALLY · El torneo exprés, contado en español de jugador.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *   El exprés cambia la regla más básica del deporte: el partido no tiene
 *   ganador. Un jugador que ve "4-2" y no ve un ganador al lado va a pensar que
 *   falta un dato. Hay que decirle lo que significa, y decírselo en la tabla,
 *   no en un reglamento que nadie abre.
 *
 *   Y hay un segundo problema que no tiene el torneo largo: en un grupo de 8
 *   cada pareja juega contra 5 de sus 7 rivales, así que dos empatadas pueden
 *   no haberse enfrentado NUNCA. Cuando eso pasa justo en el puesto que decide
 *   quién va a cuartos —que según la simulación es uno de cada cuatro
 *   domingos— no hay reglamento que lo resuelva. La pantalla tiene que decirlo
 *   claro y pasarle la decisión al organizador, no inventarse un orden.
 *
 *   Todo esto es texto, no motor, pero sale del motor: se traducen los tipos de
 *   `@/lib/engine/expres` y nada más. Una frase escrita a mano se desincroniza
 *   el día que cambie la cadena.
 */

import type {
  CriterioExpres,
  EmpateExpres,
  EstadoClinchExpres,
  TablaExpres,
} from '@/lib/engine/expres';

/** El menos de verdad (U+2212), que no es el guion del teclado. */
const MENOS = '−';

/**
 * La leyenda al pie de la tabla.
 *
 * Dice las tres cosas que un jugador de torneo largo no espera: que no hay
 * ganadores, que lo que cuenta es el saldo de games, y por qué eso es
 * comparable entre parejas que jugaron contra rivales distintos.
 */
export const LEYENDA_TABLA_EXPRES =
  'Aquí los partidos no se ganan: se suman los games que hiciste y se restan los que te hicieron. ' +
  'Un 4-2 son +2 y un 3-3 es cero. ' +
  'Todas las parejas juegan los mismos 5 partidos, o sea los mismos 30 games, así que los saldos se comparan directamente. ' +
  'Pasan a cuartos las 4 primeras de cada grupo.';

/** "+6", "0", "−4". Con el signo delante, que es como se lee un saldo. */
export function textoDeBalance(balance: number): string {
  if (balance === 0) return '0';
  return balance > 0 ? `+${balance}` : `${MENOS}${Math.abs(balance)}`;
}

/** "4-2" desde el punto de vista de quien mira. */
export function textoDeMarcador(gamesFavor: number, gamesContra: number): string {
  return `${gamesFavor}-${gamesContra}`;
}

/**
 * Un partido resuelto, contado entero: "4-2, +2".
 *
 * El saldo va detrás del marcador porque el marcador es lo que el jugador vio
 * en la cancha y el saldo es lo que le hace a su tabla.
 */
export function textoDePartido(gamesFavor: number, gamesContra: number): string {
  const saldo = gamesFavor - gamesContra;
  if (saldo === 0) return `${textoDeMarcador(gamesFavor, gamesContra)}, no suma ni resta`;
  return `${textoDeMarcador(gamesFavor, gamesContra)}, ${textoDeBalance(saldo)}`;
}

/** Por qué una pareja está en el puesto en el que está. */
const POR_CRITERIO: Record<CriterioExpres, string> = {
  balance: 'por su saldo de games',
  directo: 'por el partido entre ellas',
  manual: 'lo decidió el organizador',
  sin_resolver: 'empate sin resolver',
};

export function explicacionDeCriterio(criterio: CriterioExpres): string {
  return POR_CRITERIO[criterio];
}

/** Cómo va una pareja de cara a cuartos. */
const POR_ESTADO: Record<EstadoClinchExpres, string> = {
  clinched: 'Ya estás en cuartos',
  alive: 'Todavía puedes entrar',
  eliminated: 'Fuera de cuartos',
};

export function textoDeClinch(estado: EstadoClinchExpres): string {
  return POR_ESTADO[estado];
}

/**
 * Qué le falta a una pareja viva, en games.
 *
 * `balanceMaximo` y `balanceMinimo` salen del clinch y son el recorrido real:
 * lo mejor y lo peor que puede acabar. Enseñarlo es más útil que un "sigues
 * vivo" a secas, porque el jugador puede calcular qué necesita.
 */
export function textoDeRecorrido(balanceMinimo: number, balanceMaximo: number): string {
  if (balanceMinimo === balanceMaximo) return `Tu saldo final es ${textoDeBalance(balanceMinimo)}`;
  return `Vas a acabar entre ${textoDeBalance(balanceMinimo)} y ${textoDeBalance(balanceMaximo)}`;
}

const PALABRA = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];
const enPalabra = (n: number) => PALABRA[n] ?? String(n);

/**
 * EL AVISO DEL EMPATE QUE NO SE PUEDE RESOLVER.
 *
 * Solo sale cuando de verdad bloquea: el grupo terminó y el empate parte la
 * línea de clasificación. Un empate entre parejas que pasan todas no le
 * interesa a nadie.
 *
 * Dice tres cosas, en este orden: qué pasa, por qué el sistema no lo arregla, y
 * qué hacer. La sugerencia es un tiebreak porque es lo que se hace en la
 * cancha, pero se deja claro que RALLY no lo gestiona: lo juegan, y el
 * organizador escribe el orden.
 */
export function avisoDeEmpateExpres(tabla: TablaExpres): string | null {
  if (!tabla.bloqueaClasificacion) return null;
  const empate = tabla.empatesSinResolver.find((e) => e.decideClasificacion);
  if (!empate) return null;

  const cuantas = enPalabra(empate.pairIds.length);
  const porque =
    empate.motivo === 'no_se_enfrentaron'
      ? 'no se enfrentaron entre ellas, así que no hay partido que mirar'
      : 'se enfrentaron y el resultado entre ellas tampoco las separa';

  return (
    `Hay ${cuantas} parejas con el mismo saldo de games (${textoDeBalance(empate.balance)}) ` +
    `justo en el puesto que decide quién pasa a cuartos, y ${porque}. ` +
    `El reglamento no da para más: esto lo desempata un tiebreak en la cancha. ` +
    `Cuando lo jueguen, el organizador marca aquí quién avanza.`
  );
}

/** Versión corta para una fila de la tabla. */
export function etiquetaDeEmpate(empate: EmpateExpres): string {
  const cuantas = enPalabra(empate.pairIds.length);
  return empate.decideClasificacion
    ? `Empate a ${textoDeBalance(empate.balance)} entre ${cuantas}: decide quién pasa`
    : `Empate a ${textoDeBalance(empate.balance)} entre ${cuantas}`;
}

/**
 * Aviso de tabla provisional.
 *
 * Mientras unas hayan jugado más partidos que otras, los saldos NO son
 * comparables — que es justo lo que hace honesta a esta tabla cuando termina.
 * Callarlo sería enseñar un orden que parece firme y no lo es.
 */
export function avisoDeTablaProvisional(tabla: TablaExpres): string | null {
  if (tabla.comparable) return null;
  return (
    'Tabla provisional: todavía no todas han jugado los mismos partidos, ' +
    'así que los saldos no se pueden comparar del todo.'
  );
}

/**
 * Minutos en horas legibles: 150 → "2 h 30 min".
 *
 * Está aquí y no en la pantalla porque se puede escribir mal —y se escribió:
 * con `Math.round(150 / 60)` salía "3 h 30 min", que es media hora de pádel
 * regalada en el cartel del club. Una cuenta que se puede equivocar necesita
 * un test, y los tests viven en la lib.
 */
export function textoDeDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Los siete marcadores, para los botones del juez. */
export const MARCADORES_ETIQUETA: readonly string[] = [
  '6-0',
  '5-1',
  '4-2',
  '3-3',
  '2-4',
  '1-5',
  '0-6',
] as const;
