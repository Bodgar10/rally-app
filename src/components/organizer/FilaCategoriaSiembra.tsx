/**
 * RALLY · Una fila del checklist de siembra
 *
 * Sale de la pantalla para poder mirarla sola: es la pieza que se estrecha mal
 * —nombre de categoría largo + chip de estado en la misma línea— y a 390px eso
 * no se ve leyendo el código.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import type { EstadoDeCategoria } from '@/lib/siembra-lote';

export const etiquetaDeEstado = (e: EstadoDeCategoria): string => {
  if (e.cuadroSembrado) return 'DEFINIDA';
  if (e.motivoFuera === 'grupos_incompletos') return 'EN JUEGO';
  if (e.motivoFuera === 'bloqueantes') return 'REVISAR';
  if (e.motivoFuera === 'avisos') return 'DECIDE TÚ';
  return 'LISTA';
};

const tinte = (e: EstadoDeCategoria) => {
  if (e.cuadroSembrado) return color.muted;
  if (e.motivoFuera === 'bloqueantes') return color.danger;
  if (e.motivoFuera === 'avisos') return color.alive;
  if (e.motivoFuera === 'grupos_incompletos') return color.champagne;
  return color.live;
};

export default function FilaCategoriaSiembra({
  estado, onVerGrupos,
}: {
  estado: EstadoDeCategoria;
  onVerGrupos: () => void;
}) {
  const conProblemas = [...estado.bloqueantes, ...estado.avisos];
  return (
    <View style={[s.tarjeta, estado.seSiembraEnLote && s.tarjetaLista]}>
      <View style={s.cabecera}>
        <Text style={s.catNombre} numberOfLines={2}>{estado.nombre}</Text>
        <Text style={[s.chip, { color: tinte(estado) }]}>{etiquetaDeEstado(estado)}</Text>
      </View>

      <Text style={s.grupos}>
        {estado.gruposCompletos} de {estado.totalGrupos}{' '}
        {estado.totalGrupos === 1 ? 'grupo completo' : 'grupos completos'}
      </Text>
      <Text style={s.resumen}>{estado.resumen}</Text>

      {conProblemas.map((p, i) => (
        <Text key={i} style={s.problema}>· {p.mensaje}</Text>
      ))}

      {/* El enlace al sitio donde se arregla. Sin esto, "sortéalo en el grupo
          J" deja al organizador buscándolo entre diez pestañas. */}
      {(estado.motivoFuera === 'avisos' || estado.motivoFuera === 'bloqueantes') && (
        <Pressable
          onPress={onVerGrupos}
          style={({ pressed }) => [s.enlace, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`Abrir los grupos de ${estado.nombre}`}
        >
          <Text style={s.enlaceTexto}>Ver los grupos de {estado.nombre} →</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.lg, padding: space[4], gap: space[1] },
  tarjetaLista: { borderColor: color.line },
  // `flexWrap` + `flexShrink`: con "5ª Varonil Intermedia" y el chip en la
  // misma línea, a 390px el chip se salía de la tarjeta.
  cabecera:     { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[2], flexWrap: 'wrap' },
  catNombre:    { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flexShrink: 1 },
  chip:         { fontFamily: font.display, fontSize: 10, letterSpacing: 1 },
  grupos:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  resumen:      { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  problema:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginTop: space[1] },
  enlace:       { marginTop: space[2], alignSelf: 'flex-start', minHeight: touchTarget * 0.7, justifyContent: 'center' },
  enlaceTexto:  { fontFamily: font.body, fontSize: fontSize.body, color: color.champagne },
});
