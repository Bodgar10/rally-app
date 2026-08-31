/**
 * RALLY · Los avisos del calendario, en una línea cada uno
 *
 * LO QUE HABÍA
 *   Un bloque rojo con diez líneas y otro ámbar con quince, encima de la
 *   parrilla. Nadie lee eso. Un aviso que no se lee no es un aviso: es ruido
 *   que además empuja hacia abajo lo que el organizador vino a ver.
 *
 * LO QUE HACE
 *   Cada tipo colapsa a UNA línea con su número. Se abre si interesa. Y cada
 *   línea de dentro salta a la celda de la parrilla: antes te decían que
 *   Santiago Cantillo tiene un choque a las 15:00 y te tocaba buscarlo a mano.
 *
 * VAN DESPUÉS DE LA PARRILLA
 *   El organizador entra a ver su calendario, no a que le griten. Lo que está
 *   mal sigue estando arriba en importancia, pero no en píxeles.
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export interface LineaAviso {
  /** Texto corto: qué, quién y cuándo. */
  texto: string;
  /** El partido al que saltar. Sin esto la línea no es pulsable. */
  matchId?: string | null;
}

export interface GrupoAvisos {
  clave: string;
  /** Titular en singular y plural: se elige por la cuenta. */
  titulo: (n: number) => string;
  /** 'error' pinta en rojo; 'aviso', en ámbar. */
  tono: 'error' | 'aviso';
  lineas: LineaAviso[];
}

interface Props {
  grupos: GrupoAvisos[];
  onSaltar: (matchId: string) => void;
}

export default function AvisosPlegables({ grupos, onSaltar }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const conAlgo = grupos.filter((g) => g.lineas.length > 0);
  if (conAlgo.length === 0) return null;

  return (
    <View style={s.marco}>
      {conAlgo.map((g) => {
        const esta = abierto === g.clave;
        const rojo = g.tono === 'error';
        return (
          <View key={g.clave} style={[s.grupo, rojo ? s.grupoError : s.grupoAviso]}>
            <Pressable
              onPress={() => setAbierto(esta ? null : g.clave)}
              style={({ pressed }) => [s.cabecera, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
              accessibilityState={{ expanded: esta }}
              accessibilityLabel={g.titulo(g.lineas.length)}
            >
              <Text style={[s.titulo, rojo ? s.textoError : s.textoAviso]}>
                {g.titulo(g.lineas.length)}
              </Text>
              <Text style={[s.chevron, rojo ? s.textoError : s.textoAviso]}>
                {esta ? '▾' : '▸'}
              </Text>
            </Pressable>

            {esta && (
              <View style={s.lista}>
                {g.lineas.map((l, i) => (
                  <Pressable
                    key={i}
                    onPress={l.matchId ? () => onSaltar(l.matchId!) : undefined}
                    disabled={!l.matchId}
                    style={({ pressed }) => [s.linea, pressed && l.matchId && { opacity: 0.7 }]}
                    accessibilityRole={l.matchId ? 'button' : undefined}
                    accessibilityLabel={l.matchId ? `${l.texto}. Ver en la parrilla.` : l.texto}
                  >
                    <Text style={s.lineaTexto}>{l.texto}</Text>
                    {l.matchId && <Text style={s.lineaVer}>Ver →</Text>}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  marco: { gap: space[2] },

  grupo:      { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  grupoError: { borderColor: 'rgba(224,114,111,0.35)', backgroundColor: 'rgba(224,114,111,0.08)' },
  grupoAviso: { borderColor: color.line, backgroundColor: color.surface },

  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[3] },
  titulo:   { flex: 1, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
  chevron:  { fontFamily: font.body, fontSize: fontSize.body },

  textoError: { color: color.danger },
  textoAviso: { color: color.alive },

  lista:      { borderTopWidth: 1, borderTopColor: color.lineSoft, paddingHorizontal: space[3], paddingVertical: space[2], gap: space[2] },
  linea:      { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  lineaTexto: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  lineaVer:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },
});
