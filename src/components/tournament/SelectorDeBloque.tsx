/**
 * RALLY · Selector de bloque horario
 *
 * La pareja elige a qué hora juega su fase de grupos, de los bloques que
 * tengan cupo. Una sola elección, firme: no hay primera y segunda opción.
 *
 * POR QUÉ NO ES UNA LISTA DE RADIO BUTTONS
 *   Lo que se está eligiendo es una hora, y la hora es el dato que se busca con
 *   la mirada. Así que la hora va en grande, agrupada por día, y el cupo debajo
 *   en pequeño. Un radio button pondría el foco en el punto, no en la hora.
 *
 * EL CUPO NO ES UNA DIVISIÓN
 *   Lo calcula `cupoDeBloque` del motor, que ya sabe que un grupo son parejas
 *   de la MISMA categoría y que ocupa carriles enteros. Si 5ª Fuerza tiene 7
 *   parejas en un bloque, ocupa 3 carriles y le sobran 2 huecos que SOLO
 *   sirven para 5ª Fuerza. Por eso hace falta la categoría antes que nada:
 *   sin ella el cupo no se puede responder.
 *
 *   Y tampoco son siempre 3 por grupo: una categoría de 8 parejas juega en dos
 *   grupos de 4, y un grupo de 4 son 6 partidos — dos carriles, no uno. Ese
 *   dato entra por `opcionesCupo`; sin él el selector ofrecería lugares que no
 *   existen.
 *
 * LOS BLOQUES AGOTADOS NO SE MUESTRAN
 *   Salvo para el organizador (`permitirLlenos`). Él sí puede meter una pareja
 *   en un bloque lleno — esa pareja ya le pagó — y lo que le debemos es el
 *   aviso de la consecuencia antes de guardar, no un botón muerto.
 *
 * LOS BLOQUES QUE ACABAN TARDE SÍ SE MUESTRAN, CON SU HORA REAL
 *   El bloque de 20:00 a 23:00 termina de verdad cerca de las 23:45: tres
 *   partidos encadenados en una cancha se alargan 45 minutos. Ese bloque NO se
 *   oculta — en Cimepa se jugó a las 22:00 y la gente lo eligió — pero lleva la
 *   hora real debajo. Elegir a las 20:00 sin saber que sales del club casi a
 *   medianoche no es elegir.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';

import { cupoDeBloque, type Bloque, type Ocupacion, type OpcionesCupo } from '@/lib/engine/schedule/bloques';
import { rangoLegible, horaLegible, textoCupo } from '@/lib/bloques-formato';
import { formatearConDia } from '@/lib/fechas';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

interface Props {
  /** La retícula completa. El componente decide cuál se enseña. */
  bloques:      Bloque[];
  ocupacion:    Ocupacion;
  /** Sin categoría no hay cupo que calcular. */
  categoriaId:  string | null;
  valor:        string | null;
  /** `cupo` es el del bloque al momento de elegirlo: 0 significa forzado. */
  onCambio:     (bloqueId: string, cupo: number) => void;
  /** Solo el organizador. Muestra los llenos y deja elegirlos, con aviso. */
  permitirLlenos?: boolean;
  /** Tamaño de grupo por categoría. Lo trae `cargarBloquesDelTorneo`. */
  opcionesCupo?: OpcionesCupo;
}

interface BloqueConCupo extends Bloque { cupo: number }

export default function SelectorDeBloque({
  bloques, ocupacion, categoriaId, valor, onCambio,
  permitirLlenos = false, opcionesCupo = {},
}: Props) {

  if (!categoriaId) {
    return (
      <View style={s.aviso}>
        <Text style={s.avisoTexto}>Elige la categoría y aquí aparecen los horarios con lugar.</Text>
      </View>
    );
  }

  const conCupo: BloqueConCupo[] = bloques.map((b) => ({
    ...b,
    cupo: cupoDeBloque(b, ocupacion[b.id], categoriaId, opcionesCupo),
  }));

  const visibles = permitirLlenos ? conCupo : conCupo.filter((b) => b.cupo > 0);

  if (visibles.length === 0) {
    return (
      <View style={s.aviso}>
        <Text style={s.avisoTexto}>
          Ya no quedan horarios con lugar en esta categoría. Habla con el
          organizador: puede abrir más canchas o alargar el horario.
        </Text>
      </View>
    );
  }

  // Agrupados por día, en el orden en que los emite el motor (cronológico).
  const dias: string[] = [];
  for (const b of visibles) if (!dias.includes(b.dia)) dias.push(b.dia);

  const elegido = conCupo.find((b) => b.id === valor) ?? null;
  const forzando = !!elegido && elegido.cupo <= 0;

  return (
    <View style={s.raiz}>
      {dias.map((dia) => (
        <View key={dia} style={s.dia}>
          <Text style={s.diaNombre}>{formatearConDia(dia)}</Text>

          <View style={s.rejilla}>
            {visibles.filter((b) => b.dia === dia).map((b) => {
              const activo = b.id === valor;
              const lleno  = b.cupo <= 0;

              return (
                <Pressable
                  key={b.id}
                  onPress={() => onCambio(b.id, b.cupo)}
                  style={({ pressed }) => [
                    s.tarjeta,
                    lleno && s.tarjetaLlena,
                    activo && s.tarjetaActiva,
                    activo && lleno && s.tarjetaActivaLlena,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activo, disabled: false }}
                  accessibilityLabel={
                    `${formatearConDia(dia)}, de ${rangoLegible(b.desde, b.hasta)}. ${textoCupo(b.cupo)}.` +
                    (b.seSaleDeLaVentana
                      ? ` Puede terminar cerca de las ${horaLegible(b.hastaRealista)}.`
                      : '')
                  }
                >
                  {activo && (
                    <View style={[s.palomita, lleno && s.palomitaLlena]}>
                      <Text style={[s.palomitaTexto, lleno && s.palomitaTextoLleno]}>✓</Text>
                    </View>
                  )}

                  <Text style={[s.hora, activo && s.horaActiva, lleno && !activo && s.horaLlena]}>
                    {horaLegible(b.desde)}
                  </Text>
                  <Text style={s.hasta}>a {horaLegible(b.hasta)}</Text>
                  <Text style={[s.cupo, lleno && s.cupoLleno, activo && !lleno && s.cupoActivo]}>
                    {textoCupo(b.cupo)}
                  </Text>

                  {/* Sin drama y sin bloquear: el dato, y decide el jugador. */}
                  {b.seSaleDeLaVentana && (
                    <Text style={s.tarde}>
                      Puede terminar cerca de las {horaLegible(b.hastaRealista)}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {/* El aviso vive aquí, pegado a la elección, y solo cuando de verdad se
          eligió un bloque lleno. Nombrar el bloque importa: el organizador
          tiene que reconocer cuál es sin volver a mirar. */}
      {forzando && elegido && (
        <View style={s.forzado}>
          <Text style={s.forzadoTitulo}>
            {formatearConDia(elegido.dia)} de {rangoLegible(elegido.desde, elegido.hasta)} está lleno
          </Text>
          <Text style={s.forzadoTexto}>
            Esta pareja quedaría sin grupo completo, o te obligaría a abrir otra
            cancha en ese horario. Se guarda marcada como forzada y aparece así
            en la ocupación por bloque.
          </Text>
        </View>
      )}

      <Text style={s.pie}>
        Se juegan los 3 partidos del grupo seguidos, en la misma cancha. Elige
        una sola vez: el lugar se aparta al confirmar.
        {visibles.some((b) => b.seSaleDeLaVentana) && (
          ' Los horarios marcados en ámbar suelen alargarse: la hora que ves es la real.'
        )}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: space[4] },

  aviso: {
    backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, padding: space[3.5],
  },
  avisoTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  dia:       { gap: space[2] },
  diaNombre: {
    fontFamily: font.display, fontSize: fontSize.section, color: color.champagne,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },

  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },

  tarjeta: {
    flexGrow: 1, flexBasis: 124, minHeight: touchTarget + 34,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, paddingVertical: space[3], paddingHorizontal: space[3],
    justifyContent: 'center',
  },
  tarjetaLlena:       { opacity: 0.5, borderStyle: 'dashed' },
  tarjetaActiva:      { borderColor: color.gold, backgroundColor: color.surface2 },
  tarjetaActivaLlena: { opacity: 1, borderColor: color.danger, borderStyle: 'solid' },

  palomita: {
    position: 'absolute', top: space[2], right: space[2],
    width: 18, height: 18, borderRadius: radius.pill, backgroundColor: color.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  palomitaLlena:      { backgroundColor: color.danger },
  palomitaTexto:      { fontSize: 11, fontWeight: '700', color: color.onGold },
  palomitaTextoLleno: { color: color.text },

  hora:       { fontFamily: font.display, fontSize: fontSize.metric, color: color.text, lineHeight: 28 },
  horaActiva: { color: color.goldBright },
  horaLlena:  { color: color.muted },
  hasta:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: -2 },

  cupo:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: space[1.5] },
  // Ámbar, no rojo: es un aviso, no un error. El bloque es elegible.
  tarde:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, marginTop: space[1], lineHeight: 15 },
  cupoActivo: { color: color.champagne },
  cupoLleno:  { color: color.danger },

  forzado: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.danger,
    borderRadius: radius.md, padding: space[3.5], gap: space[1.5],
  },
  forzadoTitulo: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.danger },
  forzadoTexto:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  pie: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, lineHeight: 17 },
});
