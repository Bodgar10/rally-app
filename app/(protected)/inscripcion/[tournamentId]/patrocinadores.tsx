/**
 * app/(protected)/inscripcion/[tournamentId]/patrocinadores.tsx
 * Upsell de patrocinadores estilo Rappi — pantalla post-pago.
 * Muestra el catálogo de productos del torneo y permite "Apartar".
 * Sprint 5 · S5-SON-05
 */
import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius, space, font } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import { Button } from '@/components/ui';
import { SponsorCatalog } from '@/components/sponsors/SponsorCatalog';
import { SponsorUpsell } from '@/components/sponsors/SponsorUpsell';
import type { SponsorProduct } from '@/components/sponsors/SponsorCatalog';

export default function PatrocinadoresScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();
  const [selectedProduct, setSelectedProduct] = useState<SponsorProduct | null>(null);

  const handleSkip = () => {
    // Navegar al detalle del torneo al que se acaba de inscribir
    router.replace(`/(protected)/torneos/${tournamentId}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset, ...webContentColumn }}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[3] }}>
          {/* Pill "¡Inscripción exitosa!" */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(66,214,164,0.1)',
              borderWidth: 1,
              borderColor: 'rgba(66,214,164,0.3)',
              borderRadius: radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              alignSelf: 'flex-start',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 14 }}>✓</Text>
            <Text style={{ fontFamily: font.body, fontWeight: '600', fontSize: 12, color: color.live }}>
              ¡Inscripción exitosa!
            </Text>
          </View>

          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 26,
              color: color.text,
              lineHeight: 32,
            }}
          >
            Aprovecha los beneficios del torneo
          </Text>
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 13,
              color: color.muted,
              marginTop: 6,
              lineHeight: 20,
            }}
          >
            Los patrocinadores de este torneo tienen ofertas exclusivas para los jugadores inscritos.
          </Text>
        </View>

        {/* Catálogo */}
        <SponsorCatalog
          tournamentId={tournamentId}
          onReserve={(product) => setSelectedProduct(product)}
        />

        {/* Antes era un footer `position:'absolute'` a ancho de ventana: se
            salía de la columna centrada y en escritorio quedaba una barra
            cruzando la pantalla que no parecía un botón. Dentro del scroller
            hereda webContentColumn y usa el Button del design system. */}
        <View style={{ paddingHorizontal: space[4], marginTop: space[5] }}>
          <Button label="Ir a mi torneo" variant="secondary" onPress={handleSkip} />
        </View>
      </ScrollView>

      {/* Modal de upsell */}
      <SponsorUpsell
        product={selectedProduct}
        tournamentId={tournamentId}
        onClose={() => setSelectedProduct(null)}
      />
    </View>
  );
}
