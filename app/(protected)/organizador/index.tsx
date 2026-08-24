/**
 * RALLY · Landing de organizador
 *
 * Le vende el producto a quien todavía no organiza. Vive en (protected) porque
 * requiere sesión pero NO membresía: el guard de (organizer) exige owner y aquí
 * llega precisamente quien no lo es.
 *
 * Quien YA es owner no debería aterrizar aquí — el item de "Organizar" resuelve
 * el destino con useIsOrganizerOwner y lo manda directo a /(organizer)/org. El
 * redirect de abajo es la red de seguridad para las entradas por URL directa.
 */

import { useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useIsOrganizerOwner } from '@/hooks/useIsOrganizerOwner';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

/** Dolor → cómo se resuelve. Nada de listas de features. */
const ARGUMENTOS = [
  {
    titulo: 'La tabla se actualiza sola',
    cuerpo:
      'Capturas el marcador y ya. Los jugadores la ven en vivo desde su ' +
      'teléfono, sin que les mandes nada.',
  },
  {
    titulo: 'Sabes quién clasifica antes de que acabe',
    cuerpo:
      'Las posiciones y los clasificados se recalculan con cada resultado. ' +
      'Se acabó el "déjame sacar cuentas".',
  },
  {
    titulo: 'El dinero llega solo a tu cuenta',
    cuerpo:
      'Cobras la inscripción con tarjeta desde la app y se deposita en tu ' +
      'banco. Sin transferencias sueltas ni cuadrar quién pagó.',
  },
  {
    titulo: 'Empiezas hoy, sin trámites',
    cuerpo:
      'Publica tu primer torneo en minutos y registra parejas a mano. Cuando ' +
      'quieras cobrar en línea, conectas tu cuenta y listo.',
  },
];

export default function OrganizadorLandingScreen() {
  const router  = useRouter();
  const isOwner = useIsOrganizerOwner();

  // Red de seguridad para quien llegue por URL directa siendo ya owner.
  useEffect(() => {
    if (isOwner === true) router.replace('/(organizer)/org');
  }, [isOwner, router]);

  if (isOwner === undefined || isOwner === true) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button">
          <Text style={s.backText}>← Volver</Text>
        </Pressable>

        <Text style={s.eyebrow}>ORGANIZADOR</Text>
        <Text style={s.title}>Deja de armar torneos en Excel</Text>
        <Text style={s.intro}>
          Si ya organizas, sabes en qué se te va el fin de semana: actualizar la
          tabla a mano, contestar "¿cuándo juego?" cincuenta veces y perseguir
          transferencias por WhatsApp.
        </Text>

        <View style={s.lista}>
          {ARGUMENTOS.map((a) => (
            <View key={a.titulo} style={s.item}>
              <View style={s.marca} />
              <View style={s.itemTextos}>
                <Text style={s.itemTitulo}>{a.titulo}</Text>
                <Text style={s.itemCuerpo}>{a.cuerpo}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.precioBox}>
          <Text style={s.precioText}>
            Sin costo fijo ni mensualidad. RALLY cobra 5% solo cuando tú cobras.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(protected)/organizador/nuevo')}
          accessibilityRole="button"
          accessibilityLabel="Crear mi marca de torneos"
        >
          <Text style={s.btnPrimaryText}>Crear mi marca de torneos</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: color.bg },
  loading: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  back:     { marginBottom: space[1] },
  backText: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.4, marginBottom: space[2] },
  intro:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 21, marginBottom: space[2] },

  lista:      { gap: space[4] },
  item:       { flexDirection: 'row', gap: space[3] },
  marca:      { width: 2, borderRadius: 1, backgroundColor: color.gold, alignSelf: 'stretch', flexShrink: 0 },
  itemTextos: { flex: 1, minWidth: 0, gap: 3 },
  itemTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  itemCuerpo: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },

  precioBox:  { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], marginTop: space[3] },
  precioText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18, textAlign: 'center' },

  btnPrimary: {
    backgroundColor: color.gold,
    borderRadius:    radius.sm,
    borderWidth:     1,
    borderColor:     color.goldBright,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       space[2],
  },
  btnPrimaryText: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
});
