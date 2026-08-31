/**
 * RALLY · El detalle de una celda de la parrilla
 *
 * POR QUÉ EXISTE
 *   La celda dice dos palabras —categoría y ronda— porque de eso va la
 *   parrilla: ver la forma del día de un vistazo. Pero cuando el organizador
 *   toca una celda ya no está mirando el día: está mirando ESE partido, y
 *   quiere lo que la celda no cabía. Quiénes juegan, a qué hora exacta, en qué
 *   cancha.
 *
 *   Antes el toque abría directamente el diálogo de mover. Eso da por supuesto
 *   que quien toca quiere mover, y casi nunca es verdad: se toca para mirar. Y
 *   en los partidos que aún no existen —los del plan— no pasaba nada de nada:
 *   un toque muerto, sin explicación.
 *
 * LOS PARTIDOS DEL PLAN SE PUEDEN VER, PERO NO MOVER
 *   Las semifinales y la final no tienen fila en `matches` hasta que la ronda
 *   anterior termina. Se ven en la parrilla porque su hora está planificada, y
 *   aquí se dice por qué no se pueden tocar todavía, en vez de dejar el botón
 *   muerto o esconderlo.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';

import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

export interface PartidoDetalle {
  id: string;
  categoria: string;
  etapa: string;
  hora: string;
  cancha: string;
  parejaA: string | null;
  parejaB: string | null;
  estado: 'scheduled' | 'in_progress' | 'finished';
}

const ESTADO: Record<PartidoDetalle['estado'], { texto: string; tinte: string }> = {
  scheduled:   { texto: 'Por jugar', tinte: color.muted },
  in_progress: { texto: 'En juego',  tinte: color.live  },
  finished:    { texto: 'Terminado', tinte: color.champagne },
};

interface Props {
  partido: PartidoDetalle;
  /** Falso en los partidos que aún no existen como fila. Ver la cabecera. */
  sePuedeMover: boolean;
  onMover: () => void;
  onCerrar: () => void;
}

export default function DetallePartido({ partido, sePuedeMover, onMover, onCerrar }: Props) {
  const est = ESTADO[partido.estado] ?? ESTADO.scheduled;
  const jugado = partido.estado === 'finished';

  return (
    <View style={s.marco}>
      <View style={s.cabecera}>
        <View style={s.titulos}>
          <Text style={s.categoria}>{partido.categoria}</Text>
          <Text style={s.etapa}>{partido.etapa}</Text>
        </View>
        <Pressable
          onPress={onCerrar}
          style={s.cerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar el detalle"
        >
          <Text style={s.cerrarTexto}>Cerrar</Text>
        </Pressable>
      </View>

      {/* Quiénes juegan: es lo que la celda no cabía y lo que se vino a ver. */}
      <View style={s.parejas}>
        <Text style={s.pareja} numberOfLines={2}>{partido.parejaA ?? 'Por definir'}</Text>
        <Text style={s.contra}>contra</Text>
        <Text style={s.pareja} numberOfLines={2}>{partido.parejaB ?? 'Por definir'}</Text>
      </View>

      <View style={s.datos}>
        <View style={s.dato}>
          <Text style={s.datoEtiqueta}>Hora</Text>
          <Text style={s.datoValor}>{partido.hora}</Text>
        </View>
        <View style={s.dato}>
          <Text style={s.datoEtiqueta}>Cancha</Text>
          <Text style={s.datoValor}>{partido.cancha || '—'}</Text>
        </View>
        <View style={s.dato}>
          <Text style={s.datoEtiqueta}>Estado</Text>
          <Text style={[s.datoValor, { color: est.tinte }]}>{est.texto}</Text>
        </View>
      </View>

      {sePuedeMover ? (
        <Pressable
          onPress={onMover}
          style={({ pressed }) => [s.mover, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={s.moverTexto}>
            {jugado ? 'Mover de todos modos' : 'Mover de hora o cancha'}
          </Text>
        </Pressable>
      ) : (
        <Text style={s.nota}>
          Este partido todavía no existe: sale de la ronda anterior. Su hora es
          la planificada, y se podrá mover cuando se sepa quién lo juega.
        </Text>
      )}

      {jugado && sePuedeMover && (
        <Text style={s.nota}>
          Ya se jugó. Moverlo cambia el registro de cuándo ocurrió, no el
          resultado.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  marco: { gap: space[3] },

  cabecera:  { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  titulos:   { flex: 1 },
  categoria: { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text },
  etapa:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  cerrar:      { minHeight: touchTarget, justifyContent: 'center' },
  cerrarTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  parejas: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, padding: space[3.5], gap: space[1],
  },
  pareja: { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 20 },
  contra: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  datos: { flexDirection: 'row', gap: space[3] },
  dato:  { flex: 1, gap: space[1] },
  datoEtiqueta: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  datoValor:    { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },

  mover: {
    borderWidth: 1, borderColor: color.gold, borderRadius: radius.sm,
    minHeight: touchTarget, alignItems: 'center', justifyContent: 'center',
  },
  moverTexto: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.gold },

  nota: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
});
