/**
 * src/components/expres/CrearExpres.tsx
 *
 * RALLY · Montar un torneo exprés, paso a paso y con el horario a la vista.
 *
 * UNA PANTALLA, PASOS NUMERADOS, Y EL HORARIO SE RECALCULA MIENTRAS TOCAS
 *   No es un asistente de cuatro pantallas con botón de Siguiente. Es una sola
 *   que baja, con los pasos numerados, y abajo del todo el horario REAL de la
 *   tarde — hora por hora— que cambia en cuanto mueves el cupo, las canchas o
 *   la hora de apertura.
 *
 *   El motivo es que la pregunta que de verdad importa —"¿esto me cabe en la
 *   tarde?"— no se puede contestar mirando un formulario. Se contesta viendo a
 *   qué hora acaba la final. Un asistente que lo enseñe al final, después de
 *   Confirmar, obliga a volver atrás a adivinar qué mover.
 *
 * NO HAY CASILLAS DE TEXTO PARA LAS HORAS
 *   Mismo criterio que los siete botones del juez: un dato que solo puede
 *   tomar unos pocos valores no se teclea, se elige. Así no hay "12.00" ni
 *   "25:00" que validar, ni ventanas al revés.
 *
 * EL CUPO SE MUEVE DE DOS EN DOS
 *   Porque los impares no existen en este formato: cinco partidos por pareja
 *   es un número impar, así que cada grupo necesita un número par de parejas.
 *   En vez de dejar teclear 13 y explicar el error, el control no produce
 *   impares.
 *
 * LO QUE NO SE DEJA AL GUSTO
 *   Que los partidos de grupo sean a suma 6, que pasen 4 por grupo y que haya
 *   cuartos, semis y final. Eso es el formato, no una preferencia — y si fuera
 *   configurable dejaría de ser comparable entre clubes.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import {
  CUPO_MINIMO,
  MINUTOS_ESTANDAR,
  PARTIDOS_POR_PAREJA,
  planificarExpres,
  tamanosDeGrupo,
  type MinutosPorEtapa,
  type PlanExpres,
  type ZonaExpres,
} from '@/lib/engine/expres';
import { textoDeDuracion } from '@/lib/expres-texto';

export type FinalFormato = 'dos_sets_oro' | 'set_star_point';

export interface ConfigExpres {
  cupo: number;
  canchas: number;
  ventana: { desde: string; hasta: string };
  partidosPorPareja: number;
  finalFormato: FinalFormato;
  minutos: MinutosPorEtapa;
}

export interface CrearExpresProps {
  inicial?: Partial<ConfigExpres>;
  onCrear: (config: ConfigExpres, plan: PlanExpres) => Promise<void>;
  onVolver?: () => void;
}

const APERTURAS = ['09:00', '10:00', '11:00', '12:00', '13:00'];
const CIERRES = ['18:00', '19:00', '20:00', '21:00'];

const ZONA_TEXTO: Record<ZonaExpres, { etiqueta: string; c: string }> = {
  comodo: { etiqueta: 'Cabe holgado', c: color.live },
  ajustado: { etiqueta: 'Cabe justo', c: color.alive },
  limite: { etiqueta: 'Al límite', c: color.alive },
  no_cabe: { etiqueta: 'No cabe', c: color.danger },
};

export default function CrearExpres({ inicial, onCrear, onVolver }: CrearExpresProps) {
  const [cupo, setCupo] = useState(inicial?.cupo ?? 16);
  const [canchas, setCanchas] = useState(inicial?.canchas ?? 4);
  const [desde, setDesde] = useState(inicial?.ventana?.desde ?? '12:00');
  const [hasta, setHasta] = useState(inicial?.ventana?.hasta ?? '19:00');
  const [finalFormato, setFinalFormato] = useState<FinalFormato>(
    inicial?.finalFormato ?? 'dos_sets_oro',
  );
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tamanos = tamanosDeGrupo(cupo);

  const plan = useMemo(() => {
    try {
      return planificarExpres({
        cupo,
        canchas,
        ventana: { desde, hasta },
        partidosPorPareja: PARTIDOS_POR_PAREJA,
        minutos: MINUTOS_ESTANDAR,
      });
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [cupo, canchas, desde, hasta]);

  const fallo = plan instanceof Error ? plan.message : null;
  const p = plan instanceof Error ? null : plan;

  async function crear() {
    if (!p) return;
    setError(null);
    setCreando(true);
    try {
      await onCrear(
        {
          cupo,
          canchas,
          ventana: { desde, hasta },
          partidosPorPareja: PARTIDOS_POR_PAREJA,
          finalFormato,
          minutos: MINUTOS_ESTANDAR,
        },
        p,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el torneo. Inténtalo otra vez.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.cont}>
      <Text style={s.h1}>Torneo exprés</Text>
      <Text style={s.bajada}>
        Una tarde, una categoría. Cada pareja juega {PARTIDOS_POR_PAREJA} partidos a 6 games y
        pasan 4 de cada grupo a cuartos.
      </Text>

      {/* ── 1. Cupo ── */}
      <Paso numero={1} titulo="¿Cuántas parejas?">
        <Contador
          valor={cupo}
          minimo={CUPO_MINIMO}
          maximo={32}
          paso={2}
          onCambiar={setCupo}
          sufijo="parejas"
        />
        <Text style={s.pista}>
          Se reparten en dos grupos de {tamanos.A} y {tamanos.B}.
          {tamanos.A !== tamanos.B ? ' Quedan desiguales, pero los dos juegan las mismas rondas.' : ''}
        </Text>
        <Text style={s.pistaSuave}>
          Solo números pares: cinco partidos por pareja es impar, así que cada grupo necesita un
          número par de parejas. Si se apuntan 13, se cierra en 12.
        </Text>
      </Paso>

      {/* ── 2. Horario ── */}
      <Paso numero={2} titulo="¿A qué hora abres y cierras?">
        <Text style={s.etiqueta}>Empieza</Text>
        <Opciones valores={APERTURAS} valor={desde} onElegir={setDesde} />
        <Text style={s.etiqueta}>Cierra la cancha</Text>
        <Opciones valores={CIERRES} valor={hasta} onElegir={setHasta} />
      </Paso>

      {/* ── 3. Canchas ── */}
      <Paso numero={3} titulo="¿Cuántas canchas tienes?">
        <Contador valor={canchas} minimo={1} maximo={12} paso={1} onCambiar={setCanchas} sufijo="canchas" />
        <Text style={s.pista}>
          Para meter una ronda entera de un tirón hacen falta {Math.max(tamanos.A, tamanos.B) / 2}.
          Con menos, la ronda se parte en tandas y la tarde se alarga.
        </Text>
      </Paso>

      {/* ── 4. Final ── */}
      <Paso numero={4} titulo="¿Cómo se juega la final?">
        <Opciones
          valores={['dos_sets_oro', 'set_star_point']}
          etiquetas={['Dos sets a punto de oro', 'Un set con star point']}
          valor={finalFormato}
          onElegir={(v) => setFinalFormato(v as FinalFormato)}
          ancho
        />
        <Text style={s.pistaSuave}>
          Los grupos son a 6 games y cuartos y semis a un set de punto de oro. Eso no cambia: es
          lo que hace comparables las tablas entre un domingo y otro.
        </Text>
      </Paso>

      {/* ── El horario, en vivo ── */}
      <View style={s.separador} />
      <Text style={s.h2}>Cómo queda la tarde</Text>

      {fallo && (
        <View style={s.error}>
          <Text style={s.errorTexto}>{fallo}</Text>
        </View>
      )}

      {p && (
        <>
          <View style={[s.veredicto, { borderColor: ZONA_TEXTO[p.zona].c }]}>
            <Text style={[s.veredictoEtiqueta, { color: ZONA_TEXTO[p.zona].c }]}>
              {ZONA_TEXTO[p.zona].etiqueta}
            </Text>
            <Text style={s.veredictoTexto}>
              Empieza a las {p.inicio} y la final acaba a las {p.fin}.
              {p.holguraMinutos >= 0
                ? ` Sobran ${p.holguraMinutos} minutos antes de cerrar.`
                : ` Se pasa ${Math.abs(p.holguraMinutos)} minutos de la hora de cierre.`}
            </Text>
            <Text style={s.veredictoTexto}>
              Cada pareja juega {textoDeDuracion(p.minutosJugando)} de pádel. Quien no clasifique se va a
              las {p.finDeGrupos}.
            </Text>
          </View>

          {p.avisos.map((a) => (
            <View key={a} style={s.aviso}>
              <Text style={s.avisoTexto}>{a}</Text>
            </View>
          ))}

          {p.partidosMaximosQueCaben !== null &&
            p.partidosMaximosQueCaben < p.partidosPorPareja && (
              <View style={s.sugerencia}>
                <Text style={s.sugerenciaTexto}>
                  Con esta ventana solo caben {p.partidosMaximosQueCaben} partidos por pareja con
                  margen. Para que entren los {p.partidosPorPareja} completos, abre antes o
                  consigue más canchas — no bajes los partidos: son las 2 h 30 de pádel que
                  anuncias.
                </Text>
              </View>
            )}

          <View style={s.horario}>
            {p.franjas.map((f) => (
              <View key={f.orden} style={s.franja}>
                <Text style={s.hora}>{f.desde}</Text>
                <View style={s.franjaCuerpo}>
                  <Text style={s.franjaQue}>
                    {f.etapa === 'group'
                      ? `Grupo ${f.grupo} · ronda ${f.ronda}`
                      : f.etapa === 'quarter'
                        ? 'Cuartos de final'
                        : f.etapa === 'semi'
                          ? 'Semifinales'
                          : 'FINAL'}
                  </Text>
                  <Text style={s.franjaDetalle}>
                    {f.partidos} partido{f.partidos === 1 ? '' : 's'}
                    {f.tandas > 1 ? ` · ${f.tandas} tandas por falta de canchas` : ''}
                  </Text>
                </View>
                <Text style={s.horaFin}>{f.hasta}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {error && (
        <View style={s.error}>
          <Text style={s.errorTexto}>{error}</Text>
        </View>
      )}

      <Pressable
        onPress={crear}
        disabled={!p || creando}
        accessibilityRole="button"
        style={[s.crear, (!p || creando) && s.crearApagado]}
      >
        {creando ? (
          <ActivityIndicator color={color.bg} />
        ) : (
          <Text style={s.crearTexto}>Crear este torneo</Text>
        )}
      </Pressable>

      {p?.zona === 'no_cabe' && (
        <Text style={s.notaFinal}>
          Se puede crear igual: el horario se puede ajustar después. Pero tal como está, la final
          se juega fuera de hora.
        </Text>
      )}

      {onVolver && (
        <Pressable onPress={onVolver} disabled={creando} style={s.volver}>
          <Text style={s.volverTexto}>Volver</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <View style={s.paso}>
      <View style={s.pasoCabecera}>
        <View style={s.pasoNumero}>
          <Text style={s.pasoNumeroTexto}>{numero}</Text>
        </View>
        <Text style={s.pasoTitulo}>{titulo}</Text>
      </View>
      <View style={s.pasoCuerpo}>{children}</View>
    </View>
  );
}

function Contador({
  valor,
  minimo,
  maximo,
  paso,
  sufijo,
  onCambiar,
}: {
  valor: number;
  minimo: number;
  maximo: number;
  paso: number;
  sufijo: string;
  onCambiar: (v: number) => void;
}) {
  return (
    <View style={s.contador}>
      <Pressable
        onPress={() => onCambiar(Math.max(minimo, valor - paso))}
        disabled={valor <= minimo}
        accessibilityRole="button"
        accessibilityLabel={`Quitar ${paso}`}
        style={[s.contadorBoton, valor <= minimo && s.contadorApagado]}
      >
        <Text style={s.contadorSigno}>−</Text>
      </Pressable>
      <View style={s.contadorValor}>
        <Text style={s.contadorNumero}>{valor}</Text>
        <Text style={s.contadorSufijo}>{sufijo}</Text>
      </View>
      <Pressable
        onPress={() => onCambiar(Math.min(maximo, valor + paso))}
        disabled={valor >= maximo}
        accessibilityRole="button"
        accessibilityLabel={`Añadir ${paso}`}
        style={[s.contadorBoton, valor >= maximo && s.contadorApagado]}
      >
        <Text style={s.contadorSigno}>+</Text>
      </Pressable>
    </View>
  );
}

function Opciones({
  valores,
  etiquetas,
  valor,
  onElegir,
  ancho = false,
}: {
  valores: readonly string[];
  etiquetas?: readonly string[];
  valor: string;
  onElegir: (v: string) => void;
  ancho?: boolean;
}) {
  return (
    <View style={s.opciones}>
      {valores.map((v, i) => {
        const activo = v === valor;
        return (
          <Pressable
            key={v}
            onPress={() => onElegir(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            style={[s.opcion, ancho && s.opcionAncha, activo && s.opcionActiva]}
          >
            <Text style={[s.opcionTexto, activo && s.opcionTextoActivo]}>{etiquetas?.[i] ?? v}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  cont: { padding: space[4], gap: space[4] },
  h1: {
    color: color.champagne,
    fontFamily: font.display,
    fontSize: fontSize.screenH1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  h2: {
    color: color.champagne,
    fontFamily: font.display,
    fontSize: fontSize.h1Inline,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bajada: { color: color.muted, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },

  paso: { gap: space[2] },
  pasoCabecera: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pasoNumero: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  pasoNumeroTexto: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.caption },
  pasoTitulo: { flex: 1, color: color.text, fontFamily: font.body, fontSize: fontSize.cardName },
  pasoCuerpo: { gap: space[2], paddingLeft: space[4] },

  etiqueta: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pista: { color: color.champagne, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
  pistaSuave: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17 },

  contador: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  contadorBoton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: color.surface,
  },
  contadorApagado: { opacity: 0.3 },
  contadorSigno: { color: color.text, fontFamily: font.display, fontSize: fontSize.metric },
  contadorValor: { alignItems: 'center', minWidth: 90 },
  contadorNumero: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.displayL },
  contadorSufijo: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption },

  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  opcion: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: color.surface,
  },
  opcionAncha: { flexGrow: 1 },
  opcionActiva: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.14)' },
  opcionTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  opcionTextoActivo: { color: color.goldBright, fontWeight: '600' },

  separador: { height: 1, backgroundColor: color.line },

  veredicto: { gap: space[2], padding: space[3], borderRadius: radius.md, borderWidth: 1 },
  veredictoEtiqueta: {
    fontFamily: font.display,
    fontSize: fontSize.section,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  veredictoTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },

  aviso: {
    padding: space[3],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(230,180,80,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(230,180,80,0.28)',
  },
  avisoTexto: { color: color.alive, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },

  sugerencia: {
    padding: space[3],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(212,175,55,0.10)',
    borderWidth: 1,
    borderColor: color.line,
  },
  sugerenciaTexto: { color: color.champagne, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },

  horario: { gap: 1 },
  franja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  hora: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.cardName, width: 52 },
  horaFin: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, width: 40, textAlign: 'right' },
  franjaCuerpo: { flex: 1 },
  franjaQue: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  franjaDetalle: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },

  error: {
    padding: space[3],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },

  crear: {
    minHeight: touchTarget + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.gold,
  },
  crearApagado: { opacity: 0.4 },
  crearTexto: { color: color.bg, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '700' },
  notaFinal: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17 },

  volver: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  volverTexto: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption },
});
