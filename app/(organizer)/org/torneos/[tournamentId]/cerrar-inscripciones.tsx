/**
 * RALLY · Cerrar inscripciones
 *
 * TRES CAMBIOS SOBRE LA VERSIÓN ANTERIOR
 *
 * 1. DORADO, NO ROJO. Esto no destruye nada: genera los grupos y los partidos.
 *    En `registration_open` es LA acción principal del torneo.
 *
 * 2. VISTA PREVIA ANTES DE PULSAR. `computeFormat` es puro y determinista —
 *    solo importa tipos, cero I/O — así que se ejecuta aquí mismo y enseña la
 *    estructura exacta que va a generar el servidor. Misma entrada, misma
 *    salida: no hay divergencia posible con lo que ejecutará la Edge Function,
 *    que llama a la misma función.
 *
 * 3. POR CATEGORÍA, NO TODO O NADA. El backend siempre lo permitió: la Edge
 *    Function recibe `category_id` (una sola) y la RPC es
 *    close_registration_for_category. Lo de "todo o nada" era solo esta
 *    pantalla. Desde la migración 035, además, el torneo pasa a 'in_progress'
 *    solo al cerrar la ÚLTIMA categoría abierta, así que las que se dejan
 *    abiertas siguen aceptando inscripciones.
 *
 * LO MÁS IMPORTANTE DE LA PANTALLA
 *   `close-registration` solo cuenta parejas con payment_status en
 *   (paid_online, paid_offline, comp). Las 'pending' NO entran al cuadro y hoy
 *   desaparecían en silencio. Aquí se avisa en grande, por categoría.
 *
 * CATEGORÍAS VACÍAS
 *   Una categoría con <2 parejas no se puede cerrar, y desde la 035 mantiene el
 *   torneo en 'registration_open' — lo que impide terminarlo semanas después
 *   (finish_tournament exige 'in_progress'). Avisar no basta: el problema
 *   aparece mucho más tarde. Por eso se puede QUITAR aquí mismo. El trigger de
 *   la migración 033 protege el borrado con pagos, así que una vacía es segura.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import { computeFormat, type FormatPlan } from '@/lib/engine/format';
import {
  planTournament,
  type Capacidad, type PlanTorneo, type Fase as FaseCapacidad,
} from '@/lib/engine/planner';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import CuadroPreview from '@/components/tournament/CuadroPreview';
import HojaAyuda, { BotonAyuda } from '@/components/ui/HojaAyuda';
import HorasUltimoDia from '@/components/tournament/HorasUltimoDia';
import {
  programarEliminatorias,
  type CategoriaCuadro,
} from '@/lib/engine/schedule/knockout';
import { parseFechaISO, indiceLunes } from '@/lib/fechas';

// ── Modelo ──────────────────────────────────────────────────────────────────

/**
 * Los tres estados que SÍ cuentan para el cuadro. Espejo de close-registration.
 *
 * `as const` no es cosmético: sin él TS lo infiere como string[] y el .in() del
 * cliente tipado lo rechaza — espera los valores del enum payment_status.
 */
const PAGADAS = ['paid_online', 'paid_offline', 'comp'] as const;

type EstadoCategoria =
  | 'lista'        // >= 2 pagadas, plan no ambiguo
  | 'ambigua'      // >= 2 pagadas, pero el formato admite dos lecturas
  | 'faltan'       // 1 pagada
  | 'vacia'        // 0 pagadas
  | 'cerrada';     // status <> 'open'

interface Categoria {
  /**
   * Cuántos segundos de grupo se repescan. Arranca en lo que propone el
   * planificador con la capacidad del torneo, y el organizador lo ajusta.
   * Se persiste en categories.best_extra_qualifiers al cerrar.
   */
  repescados:  number;
  id:          string;
  nombre:      string;
  status:      string;
  pagadas:     number;
  pendientes:  number;
  estado:      EstadoCategoria;
  plan:        FormatPlan | null;
  /** Alternativa elegida cuando el plan es ambiguo. */
  alternativa: number;
  /**
   * El formato REAL de una categoría ya cerrada, tal como quedó en la base.
   *
   * Para una cerrada no vale recalcular `computeFormat(pagadas)`: si el
   * organizador eligió una alternativa o movió el stepper antes de cerrar, la
   * predicción y lo guardado difieren, y el cálculo del último día tiene que
   * usar lo que de verdad se va a jugar.
   */
  guardado: { grupos: number; porGrupo: number; extra: number } | null;
}

// ── Presentación del plan ───────────────────────────────────────────────────

const RONDA: Record<string, string> = {
  final: 'final directa', semi: 'semifinales', quarter: 'cuartos de final',
  r16: 'octavos', r32: 'ronda de 32',
};

/** Agrupa tamaños repetidos: [4,4,3,3] -> "2 grupos de 4 y 2 de 3". */
function describirGrupos(tam: number[]): string {
  if (tam.length === 1) return `Todos contra todos (${tam[0]} parejas)`;

  // Cuenta cuántos grupos hay de cada tamaño, conservando el orden de aparición.
  const conteo: Array<{ tamano: number; n: number }> = [];
  for (const t of tam) {
    const ya = conteo.find((c) => c.tamano === t);
    if (ya) ya.n++; else conteo.push({ tamano: t, n: 1 });
  }

  const trozos = conteo.map((c, i) =>
    c.n === 1
      ? (i === 0 ? `un grupo de ${c.tamano}` : `otro de ${c.tamano}`)
      : (i === 0 ? `${c.n} grupos de ${c.tamano}` : `${c.n} de ${c.tamano}`),
  );

  return trozos.length === 1 ? trozos[0] : `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}`;
}

/**
 * "3 partidos asegurados" · "3 partidos, o 2 en los grupos de 3".
 *
 * Es el dato que decide si el torneo cabe en un fin de semana, y el que el
 * jugador pregunta antes de inscribirse: cuántas veces va a jugar aunque
 * pierda todo. En un grupo de N son N−1.
 *
 * Con grupos desiguales NO se promedia ni se da el mínimo: se dicen los dos
 * números y de qué grupos sale cada uno. Decir "2 o 3" a secas dejaría al
 * organizador sin saber a quién le toca cuál.
 */
function describirAsegurados(tam: number[]): string {
  const distintos = [...new Set(tam)].sort((a, b) => b - a);

  if (distintos.length === 1) {
    const n = distintos[0] - 1;
    return n === 1 ? '1 partido asegurado' : `${n} partidos asegurados`;
  }

  // El tamaño mayoritario manda; los demás se enuncian como excepción.
  const [mayor, ...resto] = distintos;
  const excepciones = resto
    .map((t) => `${t - 1} en los grupos de ${t}`)
    .join(', o ');

  return `${mayor - 1} partidos, o ${excepciones}`;
}

/**
 * "1 mejor segundo" / "4 mejores terceros".
 *
 * LA POSICIÓN SE DERIVA, NO SE FIJA. El texto decía "tercero" siempre, y con
 * `advancePerGroup = 1` era falso: si pasa 1 por grupo, los primeros ya están
 * clasificados y el repescado sale de entre los SEGUNDOS. De los doce tamaños
 * con repesca (9, 11, 13, 18, 19, 21, 23, 24, 25, 27, 28, 29) solo el 24 pasa
 * 2 por grupo — o sea que el texto mentía en once de doce.
 *
 * El motor SIEMPRE estuvo bien: `selectQualifiers` filtra por
 * `position === advancePerGroup + 1`, y su test de las 9 parejas ya afirmaba
 * que el repescado es el mejor 2º. Era solo la copia.
 */
function mejoresDePosicion(posicion: number, cuantos: number): string {
  const ORDINAL: Record<number, [string, string]> = {
    2: ['segundo', 'segundos'],
    3: ['tercero', 'terceros'],
    4: ['cuarto',  'cuartos'],
    5: ['quinto',  'quintos'],
  };
  const plural = cuantos > 1;
  // Fallback numérico por si algún día un plan deja pasar 5+ por grupo.
  const [sing, plu] = ORDINAL[posicion] ?? [`${posicion}º`, `${posicion}º`];
  return plural ? `mejores ${plu}` : `mejor ${sing}`;
}

/** "2 grupos de 4 · pasan 2 por grupo · semifinales" */
function describirPlan(plan: FormatPlan): string {
  const grupos = describirGrupos(plan.groupSizes);
  const unSoloGrupo = plan.groupSizes.length === 1;
  const ronda = RONDA[plan.knockoutStart] ?? plan.knockoutStart;

  const extra = plan.bestExtraQualifiers > 0
    ? ` + ${plan.bestExtraQualifiers} ${mejoresDePosicion(plan.advancePerGroup + 1, plan.bestExtraQualifiers)}`
    : '';

  // Sin nadie que avance no hay fase final que anunciar.
  if (plan.advancePerGroup === 0 && !extra) return `${grupos} · sin fase final`;

  // Con un solo grupo, "por grupo" sobra: se pasa directo a la ronda.
  // Los asegurados van pegados a la estructura, no en otra línea: son parte de
  // la misma pregunta ("¿cómo se juega y cuánto juego?").
  const asegurados = describirAsegurados(plan.groupSizes);

  return unSoloGrupo
    ? `${grupos} · ${asegurados} · pasan ${plan.advancePerGroup}${extra} a la ${ronda}`
    : `${grupos} · ${asegurados} · pasan ${plan.advancePerGroup} por grupo${extra} · ${ronda}`;
}

/**
 * Cuántos SEGUNDOS de grupo llegan al cuadro, y con qué frase.
 *
 * Es el dato que decide si el torneo se muere a la mitad: cuando de un grupo
 * solo pasa el primero, quien pierde su primer partido ya sabe que no avanza y
 * juega el segundo por jugar.
 */
function segundosQueAvanzan(plan: FormatPlan): { n: number; grupos: number; ratio: number } {
  const grupos = plan.groupSizes.length;
  const n = plan.advancePerGroup >= 2 ? grupos : plan.bestExtraQualifiers;
  return { n, grupos, ratio: grupos === 0 ? 0 : n / grupos };
}

function fraseSegundos(x: { n: number; grupos: number; ratio: number }): string {
  if (x.ratio >= 1)   return 'Todos los segundos avanzan.';
  if (x.ratio >= 0.5) return `Quedar segundo sirve: ${x.n} de ${x.grupos} avanzan.`;
  if (x.ratio > 0)    return `Solo ${x.n} de ${x.grupos} segundos avanzan.`;
  return 'Solo avanzan los primeros. Quien pierda su primer partido queda eliminado en la práctica.';
}

/** Ronda en la que arranca un cuadro de ese tamaño. */
function knockoutStartFor(bracketSize: number): string {
  if (bracketSize <= 2) return 'final';
  if (bracketSize <= 4) return 'semi';
  if (bracketSize <= 8) return 'quarter';
  if (bracketSize <= 16) return 'r16';
  return 'r32';
}

/** La menor potencia de 2 que contiene a n. */
function pow2AlMenos(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

/**
 * Todo lo que se deriva de una sola perilla: cuántos segundos avanzan.
 *
 * Los byes y "si quedar segundo sirve" son la misma cosa vista al revés —
 * repescar a uno más quita un bye y suma un partido de primera ronda. Por eso
 * hay un solo control y no tres.
 */
function derivar(grupos: number, repescados: number) {
  const clasificados = grupos + repescados;
  const bracketSize  = pow2AlMenos(clasificados);
  return {
    clasificados,
    bracketSize,
    byes: bracketSize - clasificados,
    primeraRonda: clasificados - bracketSize / 2,
    ratio: grupos === 0 ? 0 : repescados / grupos,
  };
}

/** "Pasan los 5 primeros y los 3 mejores segundos" */
function describirClasificados(plan: FormatPlan): string {
  const g = plan.groupSizes.length;
  const directos = plan.advancePerGroup >= 2
    ? `los ${g === 1 ? 'dos primeros' : `${g * 2} primeros y segundos de grupo`}`
    : `los ${g} primeros`;
  const extra = plan.bestExtraQualifiers > 0
    ? ` y los ${plan.bestExtraQualifiers} ${mejoresDePosicion(plan.advancePerGroup + 1, plan.bestExtraQualifiers)}`
    : '';
  return `Pasan ${directos}${extra}`;
}

/** Grupos de tamaño desigual: quien esté en el grande juega un partido más. */
function avisoDesigual(plan: FormatPlan): string | null {
  const t = plan.groupSizes;
  if (t.length < 2) return null;
  const max = Math.max(...t), min = Math.min(...t);
  if (max === min) return null;
  return `Un grupo de ${max} y otro de ${min}: el de ${max} juega un partido más.`;
}

/**
 * El plan que de verdad se va a cerrar: la alternativa elegida si era ambigua,
 * con la repesca del stepper ya incorporada.
 *
 * Vive fuera del componente porque lo necesitan dos consumidores — el cierre y
 * el cálculo del último día — y tenerlo dentro obligaba a duplicar la lógica
 * de la conversión `repescados >= grupos`, que es justo donde se cuela un
 * desajuste entre lo que la pantalla enseña y lo que el servidor guarda.
 */
function planEfectivo(c: Categoria): FormatPlan | null {
  if (!c.plan) return null;
  const base = c.plan.ambiguous
    ? ([c.plan, ...(c.plan.alternatives ?? [])][c.alternativa] ?? c.plan)
    : c.plan;

  // La repesca elegida en el stepper viaja como bestExtraQualifiers, que es
  // donde la guarda `categories` desde la migración 001. Con TODOS los
  // segundos dentro pasan 2 por grupo y no hay repescados: son la misma
  // situación escrita de dos formas, y el motor de siembra espera la segunda.
  const grupos = base.groupSizes.length;
  if (grupos <= 1) return base;

  return c.repescados >= grupos
    ? { ...base, advancePerGroup: 2, bestExtraQualifiers: 0 }
    : { ...base, advancePerGroup: 1, bestExtraQualifiers: c.repescados };
}

/**
 * Cuántas parejas llegan al cuadro de una categoría. `null` = no se sabe.
 *
 * Misma fórmula que usa la Edge Function contra la base
 * (num_groups × advance_per_group + best_extra_qualifiers), aplicada aquí a la
 * vista previa. Una cerrada usa su formato guardado; una abierta, el que se
 * está editando en pantalla.
 */
function clasificadosDe(c: Categoria): number | null {
  if (c.status !== 'open') {
    return c.guardado
      ? c.guardado.grupos * c.guardado.porGrupo + c.guardado.extra
      : null;
  }
  const p = planEfectivo(c);
  if (!p) return null;
  return p.groupSizes.length * p.advancePerGroup + p.bestExtraQualifiers;
}

const DIAS_LARGOS = [
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
] as const;

/** 'domingo' a partir de 'YYYY-MM-DD'. Vacío si la fecha no es válida. */
function nombreDelDia(iso: string): string {
  const d = parseFechaISO(iso);
  return d ? DIAS_LARGOS[indiceLunes(d)] : '';
}

function clasificar(pagadas: number, status: string, plan: FormatPlan | null): EstadoCategoria {
  if (status !== 'open') return 'cerrada';
  if (pagadas === 0) return 'vacia';
  if (pagadas < 2)   return 'faltan';
  return plan?.ambiguous ? 'ambigua' : 'lista';
}

const ETIQUETA: Record<EstadoCategoria, { texto: string; tinte: string }> = {
  lista:   { texto: 'LISTA',              tinte: color.live      },
  ambigua: { texto: 'DECIDE EL FORMATO',  tinte: color.alive     },
  faltan:  { texto: 'FALTA 1 PAREJA',     tinte: color.alive     },
  vacia:   { texto: 'VACÍA',              tinte: color.muted     },
  cerrada: { texto: 'CERRADA',            tinte: color.champagne },
};

/**
 * Las dos fases de una categoría, cada una con su etiqueta y su borde
 * izquierdo.
 *
 * Antes iba todo en una línea corrida — "5 grupos de 4 y 3 · 3 partidos
 * asegurados · pasan 1 por grupo + 3 mejores segundos · cuartos" — que nadie
 * leía entera. Son dos preguntas distintas ("¿cuánto juego?" y "¿cómo se
 * clasifica?") y ahora se ven como tales.
 */
const AYUDA_SEGUNDOS = [
  'En la fase de grupos, cada grupo deja un ganador. Esos primeros lugares siempre pasan a la eliminatoria.',
  'Pero normalmente sobran lugares en el cuadro. Si tienes 10 grupos, tus 10 ganadores no llenan un cuadro de 16. Aquí decides con quién rellenas: se ordenan todos los segundos lugares del torneo por su desempeño y suben los mejores.',
  'Ejemplo. Con 10 grupos y 6 segundos que avanzan, el cuadro queda en 16 parejas: los 10 ganadores más los 6 mejores segundos. Los otros 4 segundos se quedan fuera.',
  'Por qué subirlo. Quedar segundo sirve. El que pierde su primer partido de grupo todavía tiene algo que jugar, y más parejas siguen vivas el último día.',
  'Por qué bajarlo. Cada pareja extra es un partido más, y los partidos del último día van uno detrás de otro. El torneo termina más tarde.',
  'Los saltos. Cuando el número de clasificados cruza 4, 8, 16 o 32, el cuadro gana una ronda entera y la final se recorre alrededor de una hora. Por eso a veces subir de uno en uno no cambia nada y de pronto cuesta mucho.',
  'Las horas que ves ya incluyen los retrasos habituales: los partidos se planifican a 60 minutos y suelen durar 75. Si el formato solo cabe usando todas las canchas, te avisamos — una cancha fuera de servicio ese día puede dejarte sin terminar.',
];

function BloquesDelPlan({
  plan, repescados, onRepescados, finTorneo,
}: {
  plan: FormatPlan;
  repescados: number;
  onRepescados: (n: number) => void;
  /**
   * Hora REALISTA a la que termina el último día del TORNEO con la
   * configuración actual. Es un dato global, no de esta categoría: mover este
   * stepper la mueve para todos, que es justo lo que hay que hacer visible.
   *
   * Realista y no la del plan a propósito: al organizador solo se le enseñan
   * horas en las que puede confiar. La del plan es dato interno del motor.
   */
  finTorneo: string | null;
}) {
  const [verCuadro, setVerCuadro] = useState(false);
  const [verAyuda, setVerAyuda]   = useState(false);

  const grupos = plan.groupSizes.length;
  const d      = derivar(grupos, repescados);
  const ronda  = RONDA[knockoutStartFor(d.bracketSize)] ?? '';
  const seg    = { n: repescados, grupos, ratio: d.ratio };

  // El salto de ronda es lo más contraintuitivo del sistema: repescar UNA más
  // puede disparar los byes de 0 a 7, porque el cuadro pasa a la siguiente
  // potencia de 2. Se avisa ANTES de pulsar.
  const siguiente = repescados < grupos ? derivar(grupos, repescados + 1) : null;
  const salta     = siguiente && siguiente.bracketSize > d.bracketSize;

  // El ratio se pinta, no solo se dice: el color lo hace legible de un vistazo
  // sin tener que leer la frase.
  const tinteSeg = seg.ratio >= 0.5 ? color.live
                 : seg.ratio > 0    ? color.alive
                 : color.danger;

  return (
    <View style={s.bloques}>
      <View style={s.bloque}>
        <Text style={s.bloqueEtiqueta}>FASE DE GRUPOS</Text>
        <Text style={s.bloqueLinea}>{describirGrupos(plan.groupSizes)}</Text>
        <Text style={s.bloqueNota}>{describirAsegurados(plan.groupSizes)}</Text>
      </View>

      {grupos > 1 && (
        <View style={s.bloque}>
          <View style={s.bloqueCabecera}>
            <Text style={s.bloqueEtiqueta}>ELIMINATORIAS</Text>
            <Pressable
              onPress={() => setVerCuadro((v) => !v)}
              style={({ pressed }) => [s.verCuadro, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityState={{ expanded: verCuadro }}
            >
              <Text style={s.verCuadroTexto}>{verCuadro ? 'Ocultar' : 'Ver cuadro'}</Text>
            </Pressable>
          </View>

          <Text style={s.bloqueLinea}>{ronda} · {d.clasificados} clasificados</Text>

          {/* Una sola perilla. Todo lo de abajo se recalcula al pulsarla. */}
          <View style={s.stepper}>
            <View style={s.stepperEtiquetaFila}>
              <Text style={s.stepperEtiqueta}>Segundos que avanzan</Text>
              <BotonAyuda
                onPress={() => setVerAyuda(true)}
                etiqueta="Qué son los segundos que avanzan"
              />
            </View>
            <View style={s.stepperControl}>
              <Pressable
                onPress={() => onRepescados(Math.max(0, repescados - 1))}
                disabled={repescados <= 0}
                style={({ pressed }) => [s.stepperBoton, repescados <= 0 && s.stepperInerte, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Un segundo menos"
              >
                <Text style={s.stepperSigno}>−</Text>
              </Pressable>
              <Text style={s.stepperCifra}>{repescados}</Text>
              <Pressable
                onPress={() => onRepescados(Math.min(grupos, repescados + 1))}
                disabled={repescados >= grupos}
                style={({ pressed }) => [s.stepperBoton, repescados >= grupos && s.stepperInerte, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Un segundo más"
              >
                <Text style={s.stepperSigno}>+</Text>
              </Pressable>
            </View>
          </View>

          <Text style={s.bloqueNota}>
            {d.byes > 0
              ? `${d.byes} ${d.byes === 1 ? 'pasa' : 'pasan'} directo · ${d.primeraRonda} ${d.primeraRonda === 1 ? 'partido' : 'partidos'}`
              : `Cuadro lleno · ${d.primeraRonda} partidos`}
            {finTorneo && ` · termina ${finTorneo}`}
          </Text>
          <Text style={[s.bloqueNota, { color: tinteSeg }]}>{fraseSegundos(seg)}</Text>

          {salta && (
            <Text style={s.aviso}>
              Con {repescados + 1}, el cuadro salta a{' '}
              {(RONDA[knockoutStartFor(siguiente!.bracketSize)] ?? '').toLowerCase()} y{' '}
              {siguiente!.byes} parejas pasan directo.
            </Text>
          )}

          {verCuadro && (
            <CuadroPreview
              clasificados={d.clasificados}
              grupos={grupos}
              repescados={repescados}
            />
          )}

          <HojaAyuda
            visible={verAyuda}
            onClose={() => setVerAyuda(false)}
            titulo="Segundos que avanzan"
            parrafos={AYUDA_SEGUNDOS}
          />
        </View>
      )}
    </View>
  );
}

/** Ocupación de una fase, con su barra. */
function BarraFase({ titulo, fase }: { titulo: string; fase: FaseCapacidad }) {
  const pct = Math.min(1, fase.ocupacion);
  const tinte = fase.zona === 'no_cabe' ? color.danger
              : fase.zona === 'limite'  ? color.alive
              : fase.zona === 'ajustado'? color.champagne
              : color.live;

  return (
    <View style={s.faseCaja}>
      <View style={s.faseFila}>
        <Text style={s.faseTitulo}>{titulo}</Text>
        <Text style={[s.faseCifra, { color: tinte }]}>
          {fase.usados}/{fase.presupuesto} · {Math.round(fase.ocupacion * 100)}%
        </Text>
      </View>
      <View style={s.barra}>
        <View style={[s.barraLlena, { width: `${pct * 100}%`, backgroundColor: tinte }]} />
      </View>
    </View>
  );
}

/** Lo que el scheduler dice del último día, ya resuelto para pintar. */
interface UltimoDia {
  /** 'domingo'. Sale de la fecha de la ventana, no está fijo. */
  dia: string;
  /** Hora del plan: '16:30'. Null si el día no da de sí. */
  fin: string | null;
  /**
   * Hora con los retrasos habituales. ES LA QUE DECIDE.
   *
   * La del plan sirve para ordenar el día; esta para saber si cabe. Un partido
   * de 60 minutos dura 75, y en eliminatorias ese retraso no se diluye: las
   * rondas van encadenadas y se suma ronda tras ronda.
   */
  finRealista: string | null;
  /** true si `finRealista` se pasa del cierre de la ventana. */
  seVaDeHora: boolean;
  /** Minutos por partido configurados. Para la nota al pie. */
  minutos: number;
  /** El aviso del motor sobre quedarse con una cancha menos, si lo hay. */
  avisoCanchaMenos: string | null;
  cabe: boolean;
  /** Categorías que se quedaron fuera del cálculo por no tener vista previa. */
  sinPrevia: string[];
}

/**
 * La hora a la que termina el último día.
 *
 * Sustituye a la barra de ocupación. Si el scheduler no pudo calcular —falta
 * capacidad, ninguna categoría tiene cuadro— se cae a la barra de siempre en
 * vez de dejar el hueco vacío.
 */
function UltimoDiaFin({ dato, respaldo }: { dato: UltimoDia | null; respaldo: FaseCapacidad }) {
  // Sin cálculo del scheduler se cae a la barra de ocupación de siempre, que
  // es la única parte que sigue siendo específica de esta pantalla.
  if (!dato) return <BarraFase titulo="Último día" fase={respaldo} />;

  return (
    <View style={s.faseCaja}>
      <HorasUltimoDia
        dia={dato.dia}
        fin={dato.cabe ? dato.fin : null}
        finRealista={dato.finRealista}
        seVaDeHora={dato.seVaDeHora}
        minutos={dato.minutos}
      >
        {/* Advertencia, no error: el formato cabe — depende de que no falle
            una cancha, que es otra cosa. */}
        {dato.avisoCanchaMenos && (
          <Text style={s.finAdvertencia}>{dato.avisoCanchaMenos}</Text>
        )}

        {dato.sinPrevia.length > 0 && (
          <Text style={s.finParcial}>
            Cálculo parcial: falta {dato.sinPrevia.join(', ')}.
          </Text>
        )}
      </HorasUltimoDia>
    </View>
  );
}

/**
 * El plan del torneo entero.
 *
 * Las ocho categorías compiten por las MISMAS canchas, así que decidir una por
 * una no puede saber si el conjunto cabe — y nadie se entera hasta que la gente
 * está esperando en el club. Cimepa corrió su fase de grupos al 94% y hubo
 * esperas de media hora a una hora.
 */
function BloqueCapacidad({ plan, ultimoDia }: { plan: PlanTorneo; ultimoDia: UltimoDia | null }) {
  return (
    <View style={[s.capacidad, !plan.cabe && s.capacidadMal]}>
      <Text style={s.capacidadTitulo}>
        {plan.cabe ? '¿Cabe en tus canchas?' : 'No cabe en tus canchas'}
      </Text>

      <BarraFase titulo="Fase de grupos"  fase={plan.grupos} />

      {/* El último día deja de medirse en porcentaje.
          Un 84% no dice nada accionable: el organizador no sabe si eso es
          irse a las seis o a las nueve. La hora sí, y es la pregunta que de
          verdad se hace al mover el stepper. Se calcula con el scheduler
          real —el mismo que programará el día—, no con una división de slots:
          las rondas de una categoría van encadenadas y esa dependencia es la
          que manda en la hora final. */}
      <UltimoDiaFin dato={ultimoDia} respaldo={plan.eliminacion} />

      {plan.avisos.map((a, i) => (
        <Text key={i} style={s.capacidadAviso}>· {a}</Text>
      ))}

      {plan.diagnostico && (
        <View style={s.diagnostico}>
          <Text style={s.diagnosticoTexto}>
            Faltan {plan.diagnostico.faltanSlots} partidos de espacio. Puedes: usar{' '}
            {plan.diagnostico.canchasQueFaltan}{' '}
            {plan.diagnostico.canchasQueFaltan === 1 ? 'cancha más' : 'canchas más'}, alargar{' '}
            {plan.diagnostico.horasQueFaltan}{' '}
            {plan.diagnostico.horasQueFaltan === 1 ? 'hora' : 'horas'} por día, o quitar{' '}
            {plan.diagnostico.parejasQueSobran}{' '}
            {plan.diagnostico.parejasQueSobran === 1 ? 'pareja' : 'parejas'}.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

/**
 * Cómo quedó el reparto de grupos respecto al horario que eligió cada pareja.
 *
 * Lo devuelve `close-registration`. Se enseña UNA vez, en el parte del cierre,
 * porque es el único momento en que existe: `pair_block_choices` guarda lo que
 * cada pareja eligió, no en qué grupo acabó, y no hay columna de bloque en
 * `groups` donde consultarlo después.
 */
interface AvisoBloques {
  categoria: string;
  /** Grupos armados con parejas de más de un bloque. Juegan a la hora de la mayoría. */
  mezclados: number;
  /** Parejas que nunca eligieron horario. */
  sinBloque: number;
}

/**
 * Cómo quedaron los horarios tras el cierre.
 *
 * `close-registration` dispara los dos schedulers cuando ya no queda ninguna
 * categoría abierta. Si alguno falla NO se deshace el cierre: los grupos y los
 * partidos están bien, lo que falta es la hora. Así que esta pantalla lo dice y
 * ofrece reintentar, en vez de dejar al organizador con un torneo cerrado que
 * nadie sabe a qué hora se juega.
 */
type EstadoHorarios =
  | { t: 'no_intentado' }              // quedan categorías abiertas
  | { t: 'ok' }
  | { t: 'fallo'; grupos: boolean; eliminatorias: boolean }
  | { t: 'reintentando' };

type Fase =
  | { t: 'cargando' }
  | { t: 'lista' }
  | { t: 'confirmando' }
  | { t: 'cerrando'; hecho: number; total: number; actual: string }
  | {
      t: 'resultado';
      /** Nombres leídos DE LA BASE, no acumulados por el bucle. */
      cerradas: string[];
      /** Las que siguen abiertas, también leídas de la base. */
      abiertas: string[];
      /** false si la relectura falló: entonces no se afirma nada del estado. */
      verificado: boolean;
      fallo: { nombre: string; motivo: string } | null;
      /** Solo las categorías con algo que contar. Vacío es el caso bueno. */
      bloques: AvisoBloques[];
      horarios: EstadoHorarios;
    };

export default function CerrarInscripcionesScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [capacidad, setCapacidad] = useState<PlanTorneo | null>(null);
  /**
   * Canchas, minutos y ventanas tal como vienen de la base.
   *
   * `capacidad` ya no basta: es el resultado del planificador, calculado UNA
   * vez al cargar, y la hora del último día tiene que recalcularse en cada
   * pulsación del stepper. Para eso hace falta la entrada, no la salida.
   */
  const [ventanas, setVentanas] = useState<Array<{ dia: string; desde: string; hasta: string }>>([]);
  const [canchas, setCanchas]   = useState<number | null>(null);
  const [minutos, setMinutos]   = useState<number>(60);
  const [nombre, setNombre]         = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [marcadas, setMarcadas]     = useState<Set<string>>(new Set());
  const [fase, setFase]             = useState<Fase>({ t: 'cargando' });
  const [error, setError]           = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data: cats }, { data: ws }] = await Promise.all([
      // Cast hasta que se aplique la 044 y se corra `npm run types:db`.
      (supabase.from as unknown as (v: string) => {
        select: (c: string) => { eq: (c: string, v: string) => {
          single: () => Promise<{ data: { name: string; courts: number | null; match_minutes: number | null } | null }>;
        } };
      })('tournaments')
        .select('name, courts, match_minutes').eq('id', tournamentId).single(),
      supabase.from('categories')
        .select('id, display_name, status, num_groups, advance_per_group, best_extra_qualifiers')
        .eq('tournament_id', tournamentId).order('division'),
      (supabase.from as unknown as (v: string) => {
        select: (c: string) => { eq: (c: string, v: string) => { order: (c: string) => Promise<{ data: Array<{
          dia: string; desde: string; hasta: string;
        }> | null }> } };
      })('tournament_windows')
        .select('dia, desde, hasta').eq('tournament_id', tournamentId).order('dia'),
    ]);

    if (t) setNombre(t.name);

    const filas = (cats ?? []) as Array<{
      id: string; display_name: string; status: string;
      num_groups: number | null;
      advance_per_group: number | null;
      best_extra_qualifiers: number | null;
    }>;

    const conConteos: Categoria[] = await Promise.all(filas.map(async (c) => {
      const [{ count: pagadas }, { count: pendientes }] = await Promise.all([
        supabase.from('pairs').select('id', { count: 'exact', head: true })
          .eq('category_id', c.id).in('payment_status', PAGADAS),
        supabase.from('pairs').select('id', { count: 'exact', head: true })
          .eq('category_id', c.id).eq('payment_status', 'pending'),
      ]);

      const n = pagadas ?? 0;
      // computeFormat lanza con menos de 2: hay que cortar antes.
      const plan = n >= 2 ? computeFormat(n) : null;

      return {
        id: c.id, nombre: c.display_name, status: c.status,
        pagadas: n, pendientes: pendientes ?? 0,
        estado: clasificar(n, c.status, plan),
        plan, alternativa: 0,
        // Solo las cerradas lo tienen: en una abierta las tres son NULL.
        guardado: (c.num_groups != null && c.advance_per_group != null && c.best_extra_qualifiers != null)
          ? { grupos: c.num_groups, porGrupo: c.advance_per_group, extra: c.best_extra_qualifiers }
          : null,
        // Provisional: lo reemplaza el planificador en cuanto se resuelve la
        // capacidad, unas líneas más abajo.
        repescados: plan?.bestExtraQualifiers ?? 0,
      };
    }));

    setCategorias(conConteos);

    // El plan del TORNEO ENTERO. Las categorías compiten por las mismas
    // canchas, así que decidir una por una no puede saber si el conjunto cabe.
    // Sin canchas u horarios capturados no hay nada que calcular y la pantalla
    // se queda con la vista por categoría de siempre.
    const ventanasCrudas = (ws ?? []).map((w) => ({
      dia: w.dia, desde: w.desde.slice(0, 5), hasta: w.hasta.slice(0, 5),
    }));
    setVentanas(ventanasCrudas);
    setCanchas(t?.courts ?? null);
    setMinutos(t?.match_minutes ?? 60);

    if (t?.courts && (ws ?? []).length > 0) {
      const cap: Capacidad = {
        canchas: t.courts,
        minutosPorPartido: t.match_minutes ?? 60,
        ventanas: ventanasCrudas.map((w) => ({
          fecha: w.dia, desde: w.desde, hasta: w.hasta,
        })),
      };
      // Los jugadores de cada categoría: sin ellos el planificador decide
      // contra un calendario más optimista que el real, porque el scheduler no
      // puede separar categorías que comparten gente y las apila a la misma
      // hora. Es el mismo error de mirar un modelo que no refleja lo que va a
      // pasar, un nivel por encima del calendario.
      const { data: parejasIds } = await supabase
        .from('pairs').select('category_id, player1_id, player2_id')
        .eq('tournament_id', tournamentId);

      const jugadoresPorCat = new Map<string, string[]>();
      for (const pr of parejasIds ?? []) {
        const ya = jugadoresPorCat.get(pr.category_id);
        const dos = [pr.player1_id, pr.player2_id];
        if (ya) ya.push(...dos);
        else jugadoresPorCat.set(pr.category_id, dos);
      }

      const conCapacidad = planTournament(
        conConteos.filter((c) => c.status === 'open' && c.pagadas >= 3)
          .map((c) => ({
            id: c.id,
            parejas: c.pagadas,
            jugadores: jugadoresPorCat.get(c.id),
          })),
        cap,
      );
      setCapacidad(conCapacidad);

      // El default de la perilla sale de la capacidad, igual que el tamaño de
      // grupo: si el último día va holgado, más repescados; si aprieta, más
      // byes y un domingo más ligero.
      setCategorias((prev) => prev.map((c) => {
        const p = conCapacidad.planes.get(c.id);
        return p ? { ...c, repescados: p.segundosQueAvanzan } : c;
      }));
    } else {
      setCapacidad(null);
    }
    // Por defecto van marcadas las que se pueden cerrar.
    setMarcadas(new Set(
      conConteos.filter((c) => c.estado === 'lista' || c.estado === 'ambigua').map((c) => c.id),
    ));
    setFase({ t: 'lista' });
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /**
   * A qué hora termina el último día con la configuración que hay ahora.
   *
   * UN SOLO CÁLCULO POR RENDER, no uno por categoría: las ocho compiten por
   * las mismas canchas, así que mover el stepper de una mueve la hora de
   * todas. Calcularlo dentro de cada tarjeta daría ocho respuestas distintas
   * y todas mal.
   *
   * Corre en el cliente a propósito. `programarEliminatorias` es TypeScript
   * puro y determinista —el mismo motor que usa la Edge Function—, así que
   * responde en el mismo frame que la pulsación. Una llamada de red por cada
   * toque del stepper haría la perilla inservible.
   */
  const ultimoDia = useMemo<UltimoDia | null>(() => {
    if (canchas == null || ventanas.length === 0) return null;
    const ventana = ventanas[ventanas.length - 1];

    // TODAS las categorías, no solo las que se van a cerrar ahora: las ya
    // cerradas también ocupan cancha el último día.
    const cuadros: CategoriaCuadro[] = [];
    const sinPrevia: string[] = [];
    for (const c of categorias) {
      const n = clasificadosDe(c);
      if (n === null) {
        // Sin vista previa no se puede adivinar: se dice cuál falta en vez de
        // dar una hora que se quedaría corta.
        if (c.estado !== 'vacia') sinPrevia.push(c.nombre);
        continue;
      }
      if (n < 2) continue;   // sin cuadro que programar
      cuadros.push({ id: c.id, clasificados: n });
    }
    if (cuadros.length === 0) return null;

    try {
      const plan = programarEliminatorias({
        canchas,
        desde: ventana.desde,
        hasta: ventana.hasta,
        categorias: cuadros,
        minutosPorPartido: minutos,
      });
      return {
        dia: nombreDelDia(ventana.dia),
        fin: plan.cabe ? plan.finEstimado : null,
        finRealista: plan.finRealista,
        // El motor simula con techo 23:59 para saber la hora real; aquí se
        // compara contra el cierre que el organizador SÍ configuró.
        seVaDeHora: plan.finRealista != null
          && plan.finRealista > ventana.hasta,
        minutos,
        avisoCanchaMenos: plan.avisos.find((a) => a.startsWith('Con una cancha menos')) ?? null,
        cabe: plan.cabe,
        sinPrevia,
      };
    } catch {
      // El motor valida su entrada (ventana invertida, duración fuera de
      // rango). Si rechaza, la capacidad está mal capturada: se cae a la barra.
      return null;
    }
  }, [canchas, minutos, ventanas, categorias]);

  const cerrables = useMemo(
    () => categorias.filter((c) => marcadas.has(c.id)),
    [categorias, marcadas],
  );
  const vacias = useMemo(() => categorias.filter((c) => c.estado === 'vacia'), [categorias]);
  const pendientesTotal = useMemo(
    () => cerrables.reduce((n, c) => n + c.pendientes, 0),
    [cerrables],
  );
  const abiertasTrasCerrar = useMemo(
    () => categorias.filter((c) => c.status === 'open' && !marcadas.has(c.id)).length,
    [categorias, marcadas],
  );

  function alternar(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function setRepescados(id: string, n: number) {
    setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, repescados: n } : c)));
  }

  function elegirAlternativa(id: string, idx: number) {
    setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, alternativa: idx } : c)));
  }

  /** Quitar una categoría vacía sin salir de aquí. Ver cabecera. */
  async function quitarVacia(c: Categoria) {
    setError(null);
    const { error: dbError } = await supabase.from('categories').delete().eq('id', c.id);
    if (dbError) {
      setError(`No se pudo quitar ${c.nombre}. Intenta de nuevo.`);
      return;
    }
    await cargar();
  }

  /** El plan efectivo: la alternativa elegida si era ambigua. */
  const planDe = planEfectivo;

  /**
   * Qué categorías están cerradas AHORA MISMO, según la base.
   *
   * La pantalla no puede afirmar estado que no ha comprobado. El bucle sabe
   * qué llamadas devolvieron 200, que no es lo mismo: una respuesta perdida,
   * un fallo entre la RPC y el retorno, o un error que no se propaga dejan al
   * cliente creyendo cosas. Cuando hay que dar un parte, se pregunta.
   */
  async function leerEstadoReal(): Promise<{ cerradas: string[]; abiertas: string[] } | null> {
    const { data, error: dbError } = await supabase
      .from('categories').select('display_name, status').eq('tournament_id', tournamentId);
    if (dbError || !data) {
      console.error('[cerrar-inscripciones] no se pudo releer el estado:', dbError);
      return null;
    }
    return {
      cerradas: data.filter((c) => c.status !== 'open').map((c) => c.display_name),
      abiertas: data.filter((c) => c.status === 'open').map((c) => c.display_name),
    };
  }

  /** Cierra el parte con lo que diga la base, no con lo que crea el bucle. */
  async function reportar(
    fallo: { nombre: string; motivo: string } | null,
    bloques: AvisoBloques[] = [],
    horarios: EstadoHorarios = { t: 'no_intentado' },
  ) {
    const real = await leerEstadoReal();
    setFase(real
      ? { t: 'resultado', cerradas: real.cerradas, abiertas: real.abiertas, verificado: true, fallo, bloques, horarios }
      : { t: 'resultado', cerradas: [], abiertas: [], verificado: false, fallo, bloques, horarios });
  }

  /** La respuesta de close-registration traducida al estado de la pantalla. */
  function leerHorarios(h: unknown): EstadoHorarios {
    const x = h as {
      intentado?: boolean;
      grupos?: { ok?: boolean } | null;
      eliminatorias?: { ok?: boolean } | null;
    } | null | undefined;

    if (!x?.intentado) return { t: 'no_intentado' };
    const grupos = x.grupos?.ok === true;
    const eliminatorias = x.eliminatorias?.ok === true;
    return grupos && eliminatorias ? { t: 'ok' } : { t: 'fallo', grupos, eliminatorias };
  }

  /**
   * Vuelve a correr los dos schedulers.
   *
   * Ambos son idempotentes —reprograman sobre lo que ya hay, sin tocar los
   * partidos jugados—, así que reintentar no puede empeorar nada. Por eso el
   * botón no pide confirmación.
   */
  async function reintentarHorarios() {
    if (fase.t !== 'resultado') return;
    const previo = fase;
    setFase({ ...previo, horarios: { t: 'reintentando' } });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setFase({ ...previo, horarios: { t: 'fallo', grupos: false, eliminatorias: false } }); return; }

    const correr = async (fn: string) => {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({ tournamentId }),
        });
        const cuerpo = await res.json().catch(() => null);
        if (!res.ok) console.error(`[cerrar-inscripciones] ${fn}:`, cuerpo);
        return res.ok;
      } catch (e) {
        console.error(`[cerrar-inscripciones] ${fn} no llegó:`, e);
        return false;
      }
    };

    const grupos = await correr('schedule-groups');
    const eliminatorias = await correr('schedule-knockout');

    setFase({
      ...previo,
      horarios: grupos && eliminatorias ? { t: 'ok' } : { t: 'fallo', grupos, eliminatorias },
    });
  }

  async function cerrar() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Tu sesión expiró. Vuelve a entrar.'); return; }

    const avisos: AvisoBloques[] = [];
    // Lo devuelve la ÚLTIMA llamada, que es la que dispara los schedulers
    // cuando ya no queda ninguna categoría abierta.
    let horarios: EstadoHorarios = { t: 'no_intentado' };

    for (let i = 0; i < cerrables.length; i++) {
      const c = cerrables[i];
      setFase({ t: 'cerrando', hecho: i, total: cerrables.length, actual: c.nombre });

      try {
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/close-registration`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
            },
            body: JSON.stringify({ category_id: c.id, chosen_format: planDe(c) }),
          },
        );

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          console.error('[cerrar-inscripciones] close-registration respondió con error', {
            categoria: c.nombre, categoryId: c.id, status: res.status, cuerpo: json,
          });
          await reportar({ nombre: c.nombre, motivo: traducir(json?.error) }, avisos, horarios);
          return;
        }

        // El reparto por bloque no es infalible: los restos de varios bloques
        // se juntan en un grupo que juega a la hora de la mayoría, y a los
        // demás hay que avisarles. Aquí es donde se entera el organizador.
        const b = json?.bloques;
        const mezclados = Array.isArray(b?.grupos_mezclados) ? b.grupos_mezclados.length : 0;
        const sinBloque = typeof b?.parejas_sin_bloque === 'number' ? b.parejas_sin_bloque : 0;
        if (mezclados > 0 || sinBloque > 0) {
          avisos.push({ categoria: c.nombre, mezclados, sinBloque });
        }

        horarios = leerHorarios(json?.horarios);
      } catch (e) {
        // El error se CAPTURA y se registra. Antes este catch era desnudo y
        // fijaba "Sin conexión con el servidor", que es una conclusión, no un
        // hecho: durante meses tapó un preflight CORS que devolvía 405.
        console.error('[cerrar-inscripciones] la llamada a close-registration lanzó', {
          categoria: c.nombre, categoryId: c.id, error: e,
        });
        const detalle = e instanceof Error ? e.message : String(e);
        await reportar({
          nombre: c.nombre,
          motivo: `La petición no llegó a completarse. Detalle: ${detalle}`,
        }, avisos, horarios);
        return;
      }
    }

    // También en el camino feliz se relee: ocho respuestas 200 son ocho
    // promesas, y el parte se da con hechos.
    await reportar(null, avisos, horarios);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (fase.t === 'cargando') {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  if (fase.t === 'cerrando') {
    return (
      <View style={s.cargando}>
        <ActivityIndicator color={color.gold} size="large" />
        <Text style={s.cerrandoTexto}>
          Cerrando {fase.actual}…{'\n'}({fase.hecho + 1} de {fase.total})
        </Text>
      </View>
    );
  }

  if (fase.t === 'resultado') {
    // Todo lo que se afirma aquí sale de una relectura de la base. `ninguna`
    // es el caso que antes se contaba al revés: el mensaje decía "las
    // anteriores sí quedaron cerradas" incluso cuando la que falló era la
    // PRIMERA y no se había cerrado nada.
    const ninguna = fase.verificado && fase.cerradas.length === 0;

    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.eyebrow}>
            {!fase.fallo ? 'LISTO' : ninguna ? 'NO SE CERRÓ NADA' : 'CERRADO A MEDIAS'}
          </Text>
          <Text style={s.title}>
            {!fase.fallo
              ? 'Cuadros generados'
              : ninguna
              ? 'No se cerró ninguna categoría'
              : 'Algunas categorías no se cerraron'}
          </Text>

          {!fase.verificado && (
            <View style={s.resumenFallo}>
              <Text style={s.resumenFalloTitulo}>No se pudo comprobar el estado</Text>
              <Text style={s.resumenLinea}>
                La operación terminó pero no se pudo releer la base, así que no
                sabemos qué quedó cerrado. Vuelve atrás y revisa la lista antes
                de reintentar.
              </Text>
            </View>
          )}

          {fase.cerradas.length > 0 && (
            <View style={s.resumenOk}>
              <Text style={s.resumenTitulo}>
                {fase.cerradas.length === 1
                  ? 'Hay 1 categoría cerrada'
                  : `Hay ${fase.cerradas.length} categorías cerradas`}
              </Text>
              {fase.cerradas.map((n) => (
                <Text key={n} style={s.resumenLinea}>· {n}</Text>
              ))}
            </View>
          )}

          {fase.fallo && (
            <View style={s.resumenFallo}>
              <Text style={s.resumenFalloTitulo}>{fase.fallo.nombre} no se cerró</Text>
              <Text style={s.resumenLinea}>{fase.fallo.motivo}</Text>
              {ninguna && (
                <Text style={s.resumenLinea}>
                  Ninguna otra categoría se cerró: el proceso se detuvo en la
                  primera y no llegó a intentar las demás.
                </Text>
              )}
            </View>
          )}

          {/* Las que siguen abiertas, con nombre. Es lo accionable: son las
              que hay que reintentar. */}
          {fase.verificado && fase.abiertas.length > 0 && (
            <View style={s.resumenPendiente}>
              <Text style={s.resumenTitulo}>
                {fase.abiertas.length === 1
                  ? 'Sigue abierta 1 categoría'
                  : `Siguen abiertas ${fase.abiertas.length} categorías`}
              </Text>
              {fase.abiertas.map((n) => (
                <Text key={n} style={s.resumenLinea}>· {n}</Text>
              ))}
              <Text style={s.resumenNota}>
                Vuelve atrás para reintentarlas. Cerrar una categoría es
                idempotente: las que ya están cerradas no se tocan.
              </Text>
            </View>
          )}

          {/* ── Los horarios ──────────────────────────────────────────────
              Cerrar YA programa el torneo entero. Si el jugador entra y ve su
              grupo sin hora, el cierre quedó a medias aunque los partidos
              estén bien creados: por eso esto se dice en grande y con salida. */}
          {fase.horarios.t === 'ok' && (
            <View style={s.resumenOk}>
              <Text style={s.resumenTitulo}>Horarios generados</Text>
              <Text style={s.resumenLinea}>
                Cada partido tiene ya su hora y su cancha. Los jugadores lo ven
                desde su pantalla del torneo.
              </Text>
            </View>
          )}

          {fase.horarios.t === 'reintentando' && (
            <View style={s.resumenPendiente}>
              <Text style={s.resumenTituloAviso}>Generando horarios…</Text>
            </View>
          )}

          {fase.horarios.t === 'fallo' && (
            <View style={s.resumenFallo}>
              <Text style={s.resumenFalloTitulo}>Cerrado, pero sin horarios</Text>
              <Text style={s.resumenLinea}>
                Los grupos y los partidos quedaron bien creados. Lo que falló fue
                ponerles hora y cancha:
              </Text>
              <Text style={s.resumenLinea}>
                · Fase de grupos — {fase.horarios.grupos ? 'listo' : 'no se programó'}
              </Text>
              <Text style={s.resumenLinea}>
                · Eliminatorias — {fase.horarios.eliminatorias ? 'listo' : 'no se programó'}
              </Text>
              <Text style={s.resumenNota}>
                No hace falta deshacer nada. Lo más común es que falten canchas o
                los horarios del torneo: revísalos y vuelve a intentarlo.
              </Text>
              <Pressable
                onPress={reintentarHorarios}
                style={({ pressed }) => [s.btnReintentar, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
              >
                <Text style={s.btnReintentarTexto}>Reintentar horarios</Text>
              </Pressable>
            </View>
          )}

          {/* Los horarios que no cuadraron. Se dice AQUÍ y solo aquí: el
              grupo en que acabó cada pareja no queda guardado en ningún sitio
              que se pueda consultar después. */}
          {fase.bloques.length > 0 && (
            <View style={s.resumenPendiente}>
              <Text style={s.resumenTituloAviso}>Revisa estos horarios</Text>
              {fase.bloques.map((b) => (
                <Text key={b.categoria} style={s.resumenLinea}>
                  · <Text style={s.resumenNegrita}>{b.categoria}</Text>
                  {b.mezclados > 0 && (
                    ` — ${b.mezclados} grupo${b.mezclados === 1 ? '' : 's'} con parejas de` +
                    ` distintos bloques: juegan a la hora de la mayoría`
                  )}
                  {b.mezclados > 0 && b.sinBloque > 0 && ';'}
                  {b.sinBloque > 0 && (
                    ` ${b.mezclados > 0 ? '' : '— '}${b.sinBloque} pareja` +
                    `${b.sinBloque === 1 ? '' : 's'} sin horario elegido`
                  )}
                </Text>
              ))}
              <Text style={s.resumenNota}>
                Nadie se quedó sin grupo. Lo que cambió es la hora de algunas
                parejas respecto a la que eligieron, así que avísales. La
                ocupación por bloque del panel enseña cómo quedó todo.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.btnDorado, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Text style={s.btnDoradoTexto}>Volver al torneo</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const puedeCerrar = cerrables.length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>SIGUIENTE PASO</Text>
        <Text style={s.title}>Cerrar inscripciones</Text>
        <Text style={s.bajada}>
          Al cerrar una categoría se generan sus grupos y sus partidos. Los
          jugadores ya no podrán inscribirse en ella. Las que dejes abiertas
          siguen aceptando parejas.
        </Text>

        {/* El torneo entero, antes que las categorías: si no cabe, da igual
            cuál se cierre primero. */}
        {capacidad && <BloqueCapacidad plan={capacidad} ultimoDia={ultimoDia} />}

        {categorias.map((c) => {
          const et       = ETIQUETA[c.estado];
          const marcada  = marcadas.has(c.id);
          const activable = c.estado === 'lista' || c.estado === 'ambigua';
          const plan     = planDe(c);
          const desigual = plan ? avisoDesigual(plan) : null;

          return (
            <View key={c.id} style={[s.tarjeta, marcada && s.tarjetaMarcada]}>
              <Pressable
                onPress={() => activable && alternar(c.id)}
                disabled={!activable}
                style={s.tarjetaCabecera}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marcada, disabled: !activable }}
                accessibilityLabel={c.nombre}
              >
                <View style={[s.check, marcada && s.checkMarcado, !activable && s.checkInerte]}>
                  {marcada && <Icon name="check" size={12} color={color.bg} width={2.5} />}
                </View>

                <Text style={[s.nombre, !activable && s.nombreInerte]}>{c.nombre}</Text>
                <Text style={[s.etiqueta, { color: et.tinte }]}>{et.texto}</Text>
              </Pressable>

              <View style={s.tarjetaCuerpo}>
                <Text style={s.conteo}>
                  {c.pagadas === 0
                    ? 'Sin parejas inscritas'
                    : `${c.pagadas} ${c.pagadas === 1 ? 'pareja pagada' : 'parejas pagadas'}`}
                </Text>

                {/* Lo más valioso de la pantalla: hoy estas parejas
                    desaparecen del cuadro sin que nadie se entere. */}
                {c.pendientes > 0 && (
                  <View style={s.avisoPago}>
                    <Text style={s.avisoPagoTitulo}>
                      {c.pendientes} {c.pendientes === 1 ? 'pareja no ha pagado' : 'parejas no han pagado'}
                    </Text>
                    <Text style={s.avisoPagoCuerpo}>
                      {c.pendientes === 1 ? 'Quedará fuera' : 'Quedarán fuera'} del cuadro. Cobra
                      o regístra{c.pendientes === 1 ? 'la' : 'las'} a mano antes de cerrar.
                    </Text>
                  </View>
                )}

                {/* Con formato ambiguo la línea de resumen sobraba: decía
                    exactamente lo mismo que la primera opción del radio, dos
                    veces seguidas. Las opciones ya lo dicen todo. */}
                {plan && c.estado !== 'ambigua' && (
                  <BloquesDelPlan
                    plan={plan}
                    repescados={c.repescados}
                    onRepescados={(n) => setRepescados(c.id, n)}
                    finTorneo={ultimoDia?.finRealista ?? null}
                  />
                )}
                {desigual && c.estado !== 'ambigua' && <Text style={s.desigual}>{desigual}</Text>}

                {c.estado === 'faltan' && (
                  <Text style={s.faltan}>Se necesitan 2 parejas pagadas para poder cerrar.</Text>
                )}

                {/* Alternativas del plan ambiguo */}
                {c.estado === 'ambigua' && c.plan && (
                  <View style={s.alternativas}>
                    {[c.plan, ...(c.plan.alternatives ?? [])].map((alt, i) => (
                      <Pressable
                        key={i}
                        onPress={() => elegirAlternativa(c.id, i)}
                        style={s.alternativa}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: c.alternativa === i }}
                      >
                        <View style={[s.radio, c.alternativa === i && s.radioActivo]} />
                        <Text style={s.alternativaTexto}>{describirPlan(alt)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Quitar la vacía aquí mismo: si solo se avisa, el problema
                    reaparece semanas después al intentar terminar el torneo. */}
                {c.estado === 'vacia' && (
                  <Pressable
                    onPress={() => quitarVacia(c)}
                    style={({ pressed }) => [s.quitar, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${c.nombre}`}
                  >
                    <Text style={s.quitarTexto}>Quitar categoría</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        {vacias.length > 0 && (
          <Text style={s.notaVacias}>
            Una categoría vacía sin quitar mantiene el torneo abierto y te
            impedirá terminarlo más adelante.
          </Text>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={() => setFase({ t: 'confirmando' })}
          disabled={!puedeCerrar}
          style={({ pressed }) => [
            s.btnDorado, !puedeCerrar && s.btnInactivo, pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !puedeCerrar }}
        >
          <Text style={[s.btnDoradoTexto, !puedeCerrar && s.btnTextoInactivo]}>
            {!puedeCerrar
              ? 'Elige al menos una categoría'
              : cerrables.length === 1
                ? `Cerrar ${cerrables[0].nombre}`
                : `Cerrar ${cerrables.length} categorías`}
          </Text>
        </Pressable>
      </ScrollView>

      {/* ── Confirmación ─────────────────────────────────────── */}
      {fase.t === 'confirmando' && (
        <View style={s.overlay}>
          <View style={s.dialogo}>
            <Text style={s.dialogoTitulo}>
              {cerrables.length === 1
                ? `¿Cerrar ${cerrables[0].nombre}?`
                : `¿Cerrar ${cerrables.length} categorías?`}
            </Text>

            <Text style={s.dialogoCuerpo}>
              Se generan los grupos y los partidos de {cerrables.map((c) => c.nombre).join(', ')}.
            </Text>

            {pendientesTotal > 0 && (
              <Text style={s.dialogoAviso}>
                {pendientesTotal} {pendientesTotal === 1 ? 'pareja sin pagar quedará fuera' : 'parejas sin pagar quedarán fuera'} del cuadro.
              </Text>
            )}

            <Text style={s.dialogoCuerpo}>
              {abiertasTrasCerrar > 0
                ? `Quedan ${abiertasTrasCerrar} ${abiertasTrasCerrar === 1 ? 'categoría abierta' : 'categorías abiertas'}: siguen aceptando inscripciones.`
                : 'Era la última categoría abierta, así que el torneo pasa a "En curso".'}
            </Text>

            <View style={s.dialogoBotones}>
              <Pressable
                onPress={() => setFase({ t: 'lista' })}
                style={s.dialogoCancelar}
                accessibilityRole="button"
              >
                <Text style={s.dialogoCancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={cerrar}
                style={s.dialogoConfirmar}
                accessibilityRole="button"
                accessibilityLabel="Cerrar y generar cuadros"
              >
                <Text style={s.dialogoConfirmarTexto}>Cerrar y generar cuadros</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

/** Códigos de close-registration a lenguaje de organizador. */
function traducir(codigo: unknown): string {
  const c = typeof codigo === 'string' ? codigo : '';
  if (c === 'not_enough_pairs')  return 'No llega a 2 parejas pagadas.';
  if (c === 'forbidden')         return 'No tienes permiso sobre este torneo.';
  if (c === 'category_not_found') return 'La categoría ya no existe.';
  return 'No se pudo cerrar. Intenta de nuevo.';
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cargando: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[5] },
  cerrandoTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', lineHeight: 20 },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  bajada:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[1] },

  tarjeta:        { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, overflow: 'hidden' },
  tarjetaMarcada: { borderColor: color.gold },
  tarjetaCabecera:{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], minHeight: touchTarget },
  tarjetaCuerpo:  { paddingHorizontal: space[4], paddingBottom: space[3], gap: space[2] },

  check:        { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1.5, borderColor: color.lineSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkMarcado: { backgroundColor: color.gold, borderColor: color.gold },
  checkInerte:  { opacity: 0.3 },

  nombre:       { flex: 1, minWidth: 0, fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  nombreInerte: { color: color.muted },
  etiqueta:     { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', letterSpacing: 0.5, flexShrink: 0 },

  conteo:     { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  capacidad:       { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space[4], gap: space[3], marginBottom: space[2] },
  capacidadMal:    { borderColor: color.danger, backgroundColor: 'rgba(224,114,111,0.08)' },
  capacidadTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  capacidadAviso:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  finAdvertencia:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18, marginTop: space[2] },
  finParcial:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginTop: space[1] },

  faseCaja:   { gap: space[1] },
  faseFila:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  faseTitulo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  faseCifra:  { fontFamily: font.display, fontSize: fontSize.caption },
  barra:      { height: 4, borderRadius: 2, backgroundColor: color.surface2, overflow: 'hidden' },
  barraLlena: { height: 4, borderRadius: 2 },

  diagnostico:      { backgroundColor: color.surface2, borderRadius: radius.md, padding: space[3] },
  diagnosticoTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.text, lineHeight: 19 },

  bloques:         { gap: space[3], marginTop: space[1] },
  // Borde de un solo lado: sin radio, como manda el design system.
  bloque:          { borderLeftWidth: 2, borderLeftColor: color.lineSoft, paddingLeft: space[3], gap: 3 },
  bloqueCabecera:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  bloqueEtiqueta:  { fontFamily: font.display, fontSize: 12, color: color.muted, letterSpacing: 1.8, textTransform: 'uppercase' },
  bloqueLinea:     { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 21 },
  bloqueNota:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  stepper:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], marginTop: space[2], marginBottom: space[1] },
  stepperEtiquetaFila: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  stepperEtiqueta: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, flex: 1 },
  stepperControl:  { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  stepperBoton:    { width: 34, height: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  stepperInerte:   { opacity: 0.35 },
  stepperSigno:    { fontFamily: font.display, fontSize: 18, color: color.gold },
  stepperCifra:    { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, minWidth: 22, textAlign: 'center' },
  aviso:           { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18, marginTop: space[1] },

  verCuadro:       { paddingHorizontal: space[3], paddingVertical: space[1.5], borderWidth: 1, borderColor: color.line, borderRadius: radius.sm, flexShrink: 0 },
  verCuadroTexto:  { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.gold },

  desigual:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },
  faltan:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 17 },

  avisoPago:       { backgroundColor: 'rgba(230,180,80,0.10)', borderWidth: 1, borderColor: color.alive, borderRadius: radius.sm, padding: space[3], gap: 3 },
  avisoPagoTitulo: { fontFamily: font.display, fontSize: fontSize.body, fontWeight: '600', color: color.alive },
  avisoPagoCuerpo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  alternativas:    { gap: space[2], marginTop: space[1] },
  alternativa:     { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget },
  radio:           { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.lineSoft, flexShrink: 0 },
  radioActivo:     { borderColor: color.gold, backgroundColor: color.gold },
  alternativaTexto:{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: fontSize.caption, color: color.text, lineHeight: 18 },

  quitar:      { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: space[3], borderWidth: 1, borderColor: 'rgba(224,114,111,0.30)', borderRadius: radius.sm },
  quitarTexto: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.danger },

  notaVacias: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18 },
  error:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btnDorado:        { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInactivo:      { backgroundColor: color.surface2, borderColor: color.line },
  btnDoradoTexto:   { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnTextoInactivo: { color: color.muted },

  // Perfilado, no dorado: la acción dorada de esta pantalla es cerrar. Esto es
  // arreglar algo que salió mal, y no debe competir con ella.
  btnReintentar: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: color.danger,
    borderRadius: radius.sm, minHeight: touchTarget,
    alignItems: 'center', justifyContent: 'center', marginTop: space[2],
  },
  btnReintentarTexto: {
    fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.danger, letterSpacing: 0.3,
  },

  resumenOk:         { backgroundColor: color.surface, borderWidth: 1, borderColor: color.live, borderRadius: radius.md, padding: space[4], gap: space[1] },
  resumenPendiente: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.alive, borderRadius: radius.lg, padding: space[4], gap: space[1] },
  resumenNota:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginTop: space[1] },
  resumenFallo:      { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: color.danger, borderRadius: radius.md, padding: space[4], gap: space[1] },
  resumenTitulo:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.live },
  resumenTituloAviso:{ fontFamily: font.display, fontSize: fontSize.cardName, color: color.alive },
  resumenNegrita:    { color: color.text, fontWeight: '600' },
  resumenFalloTitulo:{ fontFamily: font.display, fontSize: fontSize.cardName, color: color.danger },
  resumenLinea:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,6,8,0.82)', alignItems: 'center', justifyContent: 'center', padding: space[4.5] },
  dialogo: { width: '100%', maxWidth: 420, backgroundColor: color.surface, borderWidth: 1, borderColor: color.gold, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  dialogoTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, fontWeight: '600', color: color.text },
  dialogoCuerpo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  dialogoAviso:  { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.alive, lineHeight: 18 },
  dialogoBotones:{ flexDirection: 'row', gap: space[2], marginTop: space[2] },
  dialogoCancelar:      { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.sm },
  dialogoCancelarTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  dialogoConfirmar:     { flex: 2, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', backgroundColor: color.gold, borderRadius: radius.sm },
  dialogoConfirmarTexto:{ fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.onGold },
});
