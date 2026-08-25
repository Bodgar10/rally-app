/**
 * RALLY · "Estás inscrito, aún no hay partido"
 *
 * EL HUECO QUE TAPA
 *   El dashboard decía "No tienes partidos próximos" a alguien inscrito en un
 *   torneo que empieza en cuatro días. Técnicamente cierto y prácticamente
 *   inútil: el jugador no sabe si la app se enteró de su inscripción.
 *
 *   Los partidos no existen hasta que el organizador cierra la categoría y se
 *   genera el cuadro, así que entre inscribirse y jugar hay días de silencio.
 *   Este bloque los llena: torneo, cuándo empieza, cuánto falta, y la promesa
 *   de avisar — que es donde engancha la invitación a activar notificaciones.
 */

import { View, Text, Pressable } from 'react-native';

import Icon from '@/components/ui/Icon';
import { formatearRango, cuentaAtras } from '@/lib/fechas';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';

export interface TorneoInscrito {
  id:         string;
  nombre:     string;
  inicio:     string;   // 'YYYY-MM-DD'
  fin:        string;
  categorias: string[];
}

interface Props {
  torneo: TorneoInscrito;
  /** Ausente si las notificaciones ya están activadas o no se pueden pedir. */
  onActivarAvisos?: () => void;
}

export default function TorneoPorEmpezar({ torneo, onActivarAvisos }: Props) {
  const falta = cuentaAtras(torneo.inicio);

  return (
    <View style={{
      backgroundColor: color.surface,
      borderRadius:    radius.xl,
      borderWidth:     1,
      borderColor:     color.line,
      padding:         space[5],
      gap:             space[2],
      overflow:        'hidden',
    }}>
      {/* Barra de acento, como la heroCard del dashboard */}
      <View style={{
        height:          3,
        backgroundColor: color.gold,
        marginHorizontal: -space[5],
        marginTop:       -space[5],
        marginBottom:    space[2],
      }} />

      <Text style={{
        fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne,
        letterSpacing: 2, textTransform: 'uppercase',
      }}>
        Ya estás inscrito
      </Text>

      <Text style={{ fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text }}>
        {torneo.nombre}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1.5], marginTop: space[1] }}>
        <Icon name="calendar" size={14} color={color.muted} />
        <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
          {formatearRango(torneo.inicio, torneo.fin)}
        </Text>
      </View>

      {torneo.categorias.length > 0 && (
        <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne }}>
          {torneo.categorias.join(' · ')}
        </Text>
      )}

      {falta !== '' && (
        <Text style={{
          fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright,
          marginTop: space[2],
        }}>
          {falta}
        </Text>
      )}

      <Text style={{
        fontFamily: font.body, fontSize: fontSize.body, color: color.muted,
        lineHeight: 20, marginTop: space[1],
      }}>
        Tu horario se publica cuando el organizador cierra las inscripciones y
        arma el cuadro. Te avisamos en cuanto tengas partido.
      </Text>

      {/* La invitación a los avisos vive aquí y no en un ajuste perdido: es el
          momento en que el permiso tiene un motivo evidente. */}
      {onActivarAvisos && (
        <Pressable
          onPress={onActivarAvisos}
          style={({ pressed }) => [{
            marginTop:       space[3],
            minHeight:       touchTarget,
            borderRadius:    radius.sm,
            borderWidth:     1,
            borderColor:     color.gold,
            alignItems:      'center',
            justifyContent:  'center',
          }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Activar avisos de partido"
        >
          <Text style={{
            fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.gold,
          }}>
            Avisarme cuando tenga partido
          </Text>
        </Pressable>
      )}
    </View>
  );
}
