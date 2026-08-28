/**
 * RALLY · Las horas del último día
 *
 * Tres líneas, tres niveles:
 *   El domingo termina 16:30
 *   Con retrasos, hasta las 18:30
 *   Los partidos se planifican a 60 min y suelen durar 75. Ya está contemplado.
 *
 * POR QUÉ TRES Y NO UNA
 *   Un partido planificado a 60 minutos dura unos 75. En fase de grupos ese
 *   retraso se diluye entre canchas; en eliminatorias NO, porque las rondas van
 *   encadenadas y se suma en línea recta ronda tras ronda. La primera línea
 *   sirve para ordenar el día, la segunda para saber si cabe.
 *
 *   La tercera existe para que el organizador no vuelva a sumar el retraso por
 *   su cuenta: si no dice "ya está contemplado", lo hace.
 *
 * Compartido entre cerrar-inscripciones (donde se decide el formato) y
 * calendario (donde se ve el resultado). Los extras que cada pantalla añade
 * debajo —avisos de cancha, empalmes— van como children.
 */

import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { color, font, fontSize, space } from '@/lib/design-tokens';
import { FACTOR_RETRASO } from '@/lib/engine/schedule/knockout';

export interface HorasUltimoDiaProps {
  /** 'domingo'. Sale de la fecha de la ventana, nunca está fijo. */
  dia: string;
  /** Hora del plan, '16:30'. Null si el día no da de sí. */
  fin: string | null;
  /** Hora con los retrasos habituales. Es la que decide. */
  finRealista: string | null;
  /** true si `finRealista` se pasa del cierre de la ventana. */
  seVaDeHora: boolean;
  /** Minutos por partido configurados en el torneo. */
  minutos: number;
  titulo?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export default function HorasUltimoDia({
  dia, fin, finRealista, seVaDeHora, minutos,
  titulo = 'Último día', style, children,
}: HorasUltimoDiaProps) {
  const duracionReal = Math.round(minutos * FACTOR_RETRASO);

  return (
    <View style={[s.caja, style]}>
      <Text style={s.titulo}>{titulo}</Text>

      <Text style={[s.principal, !fin && { color: color.danger }]}>
        {fin ? `El ${dia} termina ${fin}` : `No cabe en el ${dia}`}
      </Text>

      {finRealista && (
        <Text style={[s.secundaria, seVaDeHora && { color: color.danger }]}>
          Con retrasos, hasta las {finRealista}
          {seVaDeHora && ' — después del cierre'}
        </Text>
      )}

      <Text style={s.nota}>
        Los partidos se planifican a {minutos} min y suelen durar{' '}
        {duracionReal}. Ya está contemplado.
      </Text>

      {children}
    </View>
  );
}

const s = StyleSheet.create({
  caja:       { gap: 2 },
  titulo:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  principal:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne, marginTop: space[1] },
  secundaria: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, marginTop: 2 },
  nota:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.7, lineHeight: 16, marginTop: space[1] },
});
