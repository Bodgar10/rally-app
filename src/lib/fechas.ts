/**
 * RALLY · Fechas
 *
 * EL PROBLEMA QUE RESUELVE
 *   `tournaments.start_date` y `end_date` son columnas `date` de Postgres, que
 *   llegan como la cadena 'YYYY-MM-DD'. Pasarlas a `new Date(cadena)` las
 *   interpreta como MEDIANOCHE UTC — y en México (UTC-6) eso es el día
 *   anterior:
 *
 *     new Date('2026-07-12')  →  sáb 11 de jul   ✗
 *     new Date(2026, 6, 12)   →  dom 12 de jul   ✓
 *
 *   Solo falla en zonas con offset NEGATIVO, así que pasa desapercibido en
 *   Europa y en cualquier CI en UTC. Para México, todos los torneos se
 *   mostraban un día antes.
 *
 * REGLA: nunca `new Date(cadenaDeUnaColumnaDate)`. Siempre `parseFechaISO`.
 *
 * Una fecha `date` no tiene hora ni zona: representa un día del calendario.
 * Por eso todo aquí trabaja con Date a medianoche LOCAL, que es la
 * representación que no se desplaza al formatear.
 */

// ── Nombres en español ──────────────────────────────────────────────────────
// Fijos en vez de depender de `toLocaleDateString`: el ICU de Hermes y el del
// navegador difieren en mayúsculas y abreviaturas ('jul' vs 'jul.'), y el
// calendario necesita exactamente 3 letras para que la rejilla no baile.

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

/** Empieza en LUNES: convención mexicana, no la estadounidense de domingo. */
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

/** Iniciales de la cabecera del calendario: L M M J V S D. */
export const INICIALES_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

// ── Parseo y serialización ──────────────────────────────────────────────────

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD' → Date a medianoche LOCAL. `null` si la cadena no es válida.
 *
 * Valida que la fecha EXISTA, no solo que tenga el formato: '2026-02-30' tiene
 * forma correcta pero no es un día real, y `new Date(2026, 1, 30)` lo
 * desbordaría silenciosamente al 2 de marzo.
 */
export function parseFechaISO(iso: string | null | undefined): Date | null {
  if (!iso) return null;

  const m = RE_ISO.exec(iso.trim());
  if (!m) return null;

  const anio = Number(m[1]);
  const mes  = Number(m[2]);
  const dia  = Number(m[3]);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const d = new Date(anio, mes - 1, dia);

  // Si la fecha no existía, el constructor la desbordó a otro mes.
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    return null;
  }

  return d;
}

/**
 * Date → 'YYYY-MM-DD' usando sus componentes LOCALES.
 *
 * No usa `toISOString()`: eso convierte a UTC y devolvería el día siguiente
 * para cualquier fecha local en México. Es el mismo bug al revés.
 */
export function aFechaISO(d: Date): string {
  const anio = String(d.getFullYear()).padStart(4, '0');
  const mes  = String(d.getMonth() + 1).padStart(2, '0');
  const dia  = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// ── Comparación por día ─────────────────────────────────────────────────────

/** Medianoche local de hoy. Útil para bloquear fechas pasadas. */
export function hoy(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * Compara solo el día: negativo si `a` es anterior, 0 si es el mismo, positivo
 * si es posterior. Ignora la hora, así que sirve para Dates con hora arbitraria.
 */
export function compararPorDia(a: Date, b: Date): number {
  const ya = a.getFullYear(), yb = b.getFullYear();
  if (ya !== yb) return ya - yb;
  const ma = a.getMonth(), mb = b.getMonth();
  if (ma !== mb) return ma - mb;
  return a.getDate() - b.getDate();
}

export function mismoDia(a: Date, b: Date): boolean {
  return compararPorDia(a, b) === 0;
}

/** ¿`d` cae dentro de [inicio, fin], ambos incluidos? */
export function dentroDeRango(d: Date, inicio: Date, fin: Date): boolean {
  return compararPorDia(d, inicio) >= 0 && compararPorDia(d, fin) <= 0;
}

/**
 * Días de calendario que faltan hasta `iso`. Negativo si ya pasó, 0 si es hoy.
 * `null` si la fecha no es válida.
 *
 * Cuenta DÍAS, no horas: "empieza en 1 día" tiene que significar mañana, sea la
 * hora que sea. Por eso se normaliza a medianoche local antes de restar, igual
 * que hace compararPorDia.
 */
export function diasHasta(iso: string | null | undefined): number | null {
  const d = parseFechaISO(iso);
  if (!d) return null;
  const MS_DIA = 86_400_000;
  // Math.round, no floor: el cambio de horario deja días de 23 o 25 horas y
  // sin redondear una fecha a 3 días saldría como 2.
  return Math.round((d.getTime() - hoy().getTime()) / MS_DIA);
}

/** 'Hoy' | 'Mañana' | 'En 4 días' | 'Ya empezó'. Cadena vacía si no hay fecha. */
export function cuentaAtras(iso: string | null | undefined): string {
  const d = diasHasta(iso);
  if (d === null) return '';
  if (d < 0)  return 'Ya empezó';
  if (d === 0) return 'Empieza hoy';
  if (d === 1) return 'Empieza mañana';
  return `Empieza en ${d} días`;
}

// ── Formateo ────────────────────────────────────────────────────────────────

/** '12 de julio de 2026'. Cadena vacía si la fecha no es válida. */
export function formatearLargo(iso: string | null | undefined): string {
  const d = parseFechaISO(iso);
  if (!d) return '';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** '12 jul'. Para listados donde el año se sobreentiende. */
export function formatearCorto(iso: string | null | undefined): string {
  const d = parseFechaISO(iso);
  if (!d) return '';
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/** 'Dom 12 jul'. El formato de las tarjetas Inicio/Fin del calendario. */
export function formatearConDia(iso: string | null | undefined): string {
  const d = parseFechaISO(iso);
  if (!d) return '';
  return `${DIAS_CORTOS[indiceLunes(d)]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/**
 * Rango legible, colapsando lo que se repite:
 *   mismo mes  → '12 – 13 de julio de 2026'
 *   otro mes   → '30 de junio – 2 de julio de 2026'
 *   otro año   → '30 de diciembre de 2026 – 2 de enero de 2027'
 */
export function formatearRango(
  inicioISO: string | null | undefined,
  finISO: string | null | undefined,
): string {
  const a = parseFechaISO(inicioISO);
  const b = parseFechaISO(finISO);
  if (!a || !b) return '';

  if (a.getFullYear() !== b.getFullYear()) {
    return `${formatearLargo(inicioISO)} – ${formatearLargo(finISO)}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()} de ${MESES[a.getMonth()]} – ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
  }
  if (a.getDate() !== b.getDate()) {
    return `${a.getDate()} – ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
  }
  // Torneo de un solo día: no tiene sentido escribir '12 – 12'.
  return formatearLargo(inicioISO);
}

/** 'julio 2026'. Cabecera del calendario. */
export function formatearMesAnio(anio: number, mes: number): string {
  return `${MESES[mes]} ${anio}`;
}

// ── Rejilla del mes ─────────────────────────────────────────────────────────

/** Índice del día de la semana con LUNES = 0 y domingo = 6. */
export function indiceLunes(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export interface CeldaDia {
  fecha: Date;
  /** false para los días de relleno del mes anterior o siguiente. */
  delMes: boolean;
}

/**
 * Las 42 celdas (6 semanas × 7 días) de la rejilla de un mes, empezando en
 * lunes. Siempre 6 filas para que el calendario no cambie de alto al navegar.
 *
 * `mes` es 0-indexado, como en Date.
 *
 * Los años bisiestos y la longitud de cada mes salen gratis: el constructor de
 * Date ya los resuelve, y avanzar día a día con `dia + i` desborda solo al mes
 * siguiente.
 */
export function rejillaMes(anio: number, mes: number): CeldaDia[] {
  const primero = new Date(anio, mes, 1);
  const arranque = new Date(anio, mes, 1 - indiceLunes(primero));

  const celdas: CeldaDia[] = [];
  for (let i = 0; i < 42; i++) {
    const fecha = new Date(arranque.getFullYear(), arranque.getMonth(), arranque.getDate() + i);
    celdas.push({ fecha, delMes: fecha.getMonth() === mes });
  }
  return celdas;
}

/** Suma meses conservando el día 1. Para las flechas ‹ › del calendario. */
export function sumarMeses(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const d = new Date(anio, mes + delta, 1);
  return { anio: d.getFullYear(), mes: d.getMonth() };
}

// ── Horas de torneo (timestamptz) ───────────────────────────────────────────
//
// OTRO PROBLEMA, EL INVERSO DEL DE ARRIBA
//   `matches.scheduled_at` y `match_schedule.scheduled_at` son `timestamptz`.
//   Postgres los guarda en UTC y PostgREST los devuelve en UTC:
//
//     el scheduler escribe  2026-09-13T08:00:00-06:00
//     la lectura devuelve   2026-09-13T14:00:00+00:00   ← el mismo instante
//
//   Leer la hora del TEXTO da 14:00, que es falso. Y formatear con
//   `toLocaleTimeString` sin zona da la hora del DISPOSITIVO, que es igual de
//   falso para quien abra la app desde otro huso: el jugador en Madrid vería
//   las 16:00 de un partido que se juega a las 8 de la mañana en el club.
//
//   La hora de un torneo es la del club. Siempre. No la del servidor ni la de
//   quien mira.

/**
 * La zona en la que se juegan los torneos.
 *
 * Un solo sitio, exportada. Cuando RALLY salga de México esto pasará a ser una
 * columna del torneo o de la sede; hasta entonces, una constante honesta es
 * mejor que un offset repetido por pantalla.
 *
 * Se usa el nombre IANA y no '-06:00' a propósito: México abolió el horario de
 * verano en 2022, pero si algún día vuelve, el nombre sigue siendo correcto y
 * el offset fijo no.
 */
export const ZONA_TORNEO = 'America/Mexico_City';

/**
 * 'HH:MM' en la zona del club, venga el ISO en la zona que venga.
 *
 * Cadena vacía si no hay hora: quien llama decide qué poner en su lugar
 * ('Por definir', '—', …) según su contexto.
 */
export function horaDeTorneo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_TORNEO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * 'dom, 13 sept, 08:00' en la zona del club. Para cuando el día importa tanto
 * como la hora — el próximo partido de un torneo de tres días, por ejemplo.
 */
export function fechaHoraDeTorneo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_TORNEO,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
