/**
 * src/components/player/AvisoDePrioridad.tsx
 *
 * RALLY · "Los suscriptores entran antes", en la pantalla de inscripción.
 *
 * VA DONDE SE DECIDE
 *   Este aviso no sirve en el perfil ni en la pantalla de planes: sirve en el
 *   momento en que el jugador va a inscribirse y descubre que todavía no
 *   puede. Ahí el dato que necesita —a qué hora abre para él— y la razón por la
 *   que otros ya están dentro son la misma frase.
 *
 * NO METE MIEDO
 *   Nada de "te quedas fuera". El cupo puede perfectamente no llenarse, y un
 *   jugador al que se le mete prisa y luego encuentra sitio de sobra aprende a
 *   no creerse el aviso la próxima vez.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { leerSuscripcion } from '@/lib/suscripcion-datos';
import { estadoDePrioridad, textoDePrioridad } from '@/lib/prioridad-inscripcion';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

/**
 * Lee `tournaments.prioridad_hasta`.
 *
 * ► EL CAST ES TEMPORAL Y VIVE SOLO AQUÍ. `database.types.ts` se genera del
 *   proyecto remoto, así que la columna no existe para TypeScript hasta que se
 *   corra la migración 080. Una puerta con cast, no un cast por pantalla.
 */
async function leerPrioridad(tournamentId: string): Promise<string | null> {
  try {
    const consulta = supabase.from('tournaments').select('prioridad_hasta' as never) as unknown as {
      eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
    const { data } = await consulta.eq('id', tournamentId).maybeSingle();
    return (data as { prioridad_hasta?: string | null } | null)?.prioridad_hasta ?? null;
  } catch {
    return null;
  }
}

export function AvisoDePrioridad({
  tournamentId,
  userId,
}: {
  tournamentId: string;
  userId: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState<string | null>(null);
  const [esPro, setEsPro] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [prioridad, sub] = await Promise.all([
        leerPrioridad(tournamentId),
        leerSuscripcion(userId),
      ]);
      if (!vivo) return;
      const ahora = new Date();
      setEsPro(sub.activa);
      setTexto(textoDePrioridad(estadoDePrioridad(prioridad, sub.activa, ahora), sub.activa, ahora));
    })();
    return () => { vivo = false; };
  }, [tournamentId, userId]);

  if (!texto) return null;

  return (
    <View style={[s.caja, esPro ? s.cajaPro : s.cajaAviso]}>
      <Text style={[s.texto, esPro && s.textoPro]}>{texto}</Text>
      {!esPro && (
        <Pressable onPress={() => router.push('/(protected)/planes')} accessibilityRole="button">
          <Text style={s.enlace}>Entrar antes con Pro</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  caja: { gap: space[1], padding: space[3], borderRadius: radius.sm, borderWidth: 1 },
  cajaPro: { borderColor: 'rgba(66,214,164,0.32)', backgroundColor: 'rgba(66,214,164,0.10)' },
  cajaAviso: { borderColor: color.line, backgroundColor: 'rgba(212,175,55,0.08)' },
  texto: { color: color.text, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
  textoPro: { color: color.live },
  enlace: { color: color.goldBright, fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600' },
});

export default AvisoDePrioridad;
