/**
 * src/components/sponsors/SponsorCatalog.tsx
 * Catálogo de productos de patrocinadores por torneo.
 * Cards premium: imagen, patrocinador, descripción, CTA "Apartar".
 * Distinción visual: producto RALLY vs producto de patrocinador.
 * El lead (acción "Apartar") se maneja en SponsorUpsell — este es solo display.
 * Sprint 5 · S5-SON-04
 *
 * NOTA (ajuste §0): el esquema real (migración 004) NO tiene en sponsor_products las
 * columnas tournament_id, is_platform_product ni cta_label. La relación torneo↔sponsor
 * vive en tournament_sponsors, y el discriminador propio/patrocinador es el enum
 * product_type ('own_product' = RALLY, 'sponsor_lead' = externo). La carga de datos se
 * adapta a eso (ver loadProducts). cta_label no existe → la UI usa 'Apartar' por defecto.
 */
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { color, radius, space, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type SponsorProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sponsor_id: string | null;
  sponsor_name: string | null;
  /** true = producto de la plataforma RALLY (product_type 'own_product'); false = patrocinador externo */
  is_platform_product: boolean;
  cta_label: string | null; // ej. "Apartar", "Solicitar muestra", "Ver más"
  price_display: string | null; // texto libre, ej. "desde $500 MXN" — informativo, no es cobro
};

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; products: SponsorProduct[] };

// ─── Props ──────────────────────────────────────────────────────────────────

type SponsorCatalogProps = {
  tournamentId: string;
  /** Callback cuando el usuario toca "Apartar" en un producto */
  onReserve: (product: SponsorProduct) => void;
};

// ─── Componente ─────────────────────────────────────────────────────────────

export function SponsorCatalog({ tournamentId, onReserve }: SponsorCatalogProps) {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });

  useEffect(() => {
    loadProducts(tournamentId).then(setState);
  }, [tournamentId]);

  if (state.status === 'loading') {
    return (
      <View style={{ padding: space[4], alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={{ padding: space[4] }}>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: color.danger }}>
          {state.message}
        </Text>
      </View>
    );
  }

  if (state.status === 'empty') {
    return (
      <View
        style={{
          margin: space[4],
          backgroundColor: color.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.lineSoft,
          padding: space[5],
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 28 }}>🏷️</Text>
        <Text
          style={{
            fontFamily: font.display,
            fontWeight: '500',
            fontSize: 16,
            color: color.text,
            textAlign: 'center',
          }}
        >
          Sin productos en este torneo
        </Text>
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 13,
            color: color.muted,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          El organizador aún no ha agregado productos de patrocinadores para este torneo.
        </Text>
      </View>
    );
  }

  // Separar productos propios vs patrocinadores externos
  const rally = state.products.filter((p) => p.is_platform_product);
  const sponsors = state.products.filter((p) => !p.is_platform_product);

  return (
    <View style={{ gap: space[3] }}>
      {/* Productos RALLY (plataforma) */}
      {rally.length > 0 && (
        <View>
          <SectionLabel title="Ofertas RALLY" />
          <View style={{ paddingHorizontal: space[4], gap: 12, marginTop: space[2] }}>
            {rally.map((p) => (
              <ProductCard key={p.id} product={p} onReserve={onReserve} isPlatform />
            ))}
          </View>
        </View>
      )}

      {/* Productos de patrocinadores */}
      {sponsors.length > 0 && (
        <View>
          <SectionLabel title="Patrocinadores del torneo" />
          <View style={{ paddingHorizontal: space[4], gap: 12, marginTop: space[2] }}>
            {sponsors.map((p) => (
              <ProductCard key={p.id} product={p} onReserve={onReserve} isPlatform={false} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Tarjeta de producto ──────────────────────────────────────────────────────

function ProductCard({
  product,
  onReserve,
  isPlatform,
}: {
  product: SponsorProduct;
  onReserve: (p: SponsorProduct) => void;
  isPlatform: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.xl2,
        borderWidth: 1,
        borderColor: isPlatform ? color.line : color.lineSoft,
        overflow: 'hidden',
      }}
    >
      {/* Borde dorado superior solo en productos RALLY */}
      {isPlatform && (
        <View
          style={{
            height: 2.5,
            backgroundColor: color.gold,
          }}
        />
      )}

      {/* Imagen del producto */}
      {product.image_url ? (
        <Image
          source={{ uri: product.image_url }}
          style={{ width: '100%', height: 140, backgroundColor: color.surface2 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: '100%',
            height: 100,
            backgroundColor: color.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 32 }}>{isPlatform ? '⭐' : '🎾'}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 10 }}>
        {/* Etiqueta de patrocinador */}
        {product.sponsor_name && !isPlatform && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              alignSelf: 'flex-start',
              backgroundColor: color.surface2,
              borderRadius: radius.xs,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontFamily: font.body, fontSize: 10, color: color.muted }}>
              Patrocinador
            </Text>
            <Text
              style={{
                fontFamily: font.display,
                fontWeight: '500',
                fontSize: 10,
                color: color.champagne,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {product.sponsor_name}
            </Text>
          </View>
        )}

        {isPlatform && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(212,175,55,0.1)',
              borderRadius: radius.xs,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: color.line,
            }}
          >
            <Text
              style={{
                fontFamily: font.display,
                fontWeight: '600',
                fontSize: 10,
                color: color.goldBright,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              RALLY
            </Text>
          </View>
        )}

        {/* Nombre del producto */}
        <Text
          style={{
            fontFamily: font.display,
            fontWeight: '500',
            fontSize: 17,
            color: color.text,
            lineHeight: 22,
          }}
        >
          {product.name}
        </Text>

        {/* Descripción */}
        {product.description && (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 13,
              color: color.muted,
              lineHeight: 20,
            }}
            numberOfLines={3}
          >
            {product.description}
          </Text>
        )}

        {/* Precio informativo — no implica cobro automático */}
        {product.price_display && (
          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 13,
              color: color.goldBright,
            }}
          >
            {product.price_display}
          </Text>
        )}

        {/* CTA */}
        <Pressable
          onPress={() => onReserve(product)}
          style={({ pressed }) => ({
            marginTop: 4,
            borderRadius: radius.sm,
            backgroundColor: isPlatform ? color.gold : color.surface2,
            borderWidth: isPlatform ? 0 : 1,
            borderColor: color.line,
            paddingVertical: 11,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 14,
              color: isPlatform ? color.onGold : color.goldBright,
              letterSpacing: 0.3,
            }}
          >
            {product.cta_label ?? 'Apartar'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: space[4] }}>
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '500',
          fontSize: 13,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: color.champagne,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

// ─── Carga de datos ───────────────────────────────────────────────────────────

async function loadProducts(tournamentId: string): Promise<CatalogState> {
  try {
    // 1) Sponsors vinculados a este torneo. La relación vive en tournament_sponsors;
    //    sponsor_products NO tiene tournament_id.
    const { data: links, error: linkErr } = await supabase
      .from('tournament_sponsors')
      .select('sponsor_id')
      .eq('tournament_id', tournamentId);
    if (linkErr) throw linkErr;

    const sponsorIds = (links ?? []).map((l: any) => l.sponsor_id as string);
    if (sponsorIds.length === 0) return { status: 'empty' };

    // 2) Productos activos de esos sponsors. RLS ya exige active=true + sponsor activo
    //    (policy products_select_active de la migración 027); lo dejamos explícito como
    //    defensa en profundidad. El discriminador propio/patrocinador es product_type.
    const { data, error } = await supabase
      .from('sponsor_products')
      .select(`
        id,
        name,
        description,
        image_url,
        product_type,
        active,
        price_display,
        sponsor_id,
        sponsors:sponsor_id (name, active)
      `)
      .in('sponsor_id', sponsorIds)
      .eq('active', true)
      .order('product_type', { ascending: false }) // 'own_product' (RALLY) antes que 'sponsor_lead'
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Un producto de un patrocinador desactivado no debe mostrarse (defensa adicional
    // al filtro de RLS, porque PostgREST no permite filtrar la tabla padre por una
    // columna de la tabla embebida en una sola query).
    const visible = (data ?? []).filter((row: any) => {
      const sponsorActive = (row.sponsors as any)?.active;
      return sponsorActive !== false;
    });

    const products: SponsorProduct[] = visible.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      image_url: row.image_url ?? null,
      sponsor_id: row.sponsor_id ?? null,
      sponsor_name: (row.sponsors as any)?.name ?? null,
      is_platform_product: row.product_type === 'own_product',
      cta_label: null, // sponsor_products no tiene columna cta_label; la UI usa 'Apartar' por defecto
      price_display: row.price_display ?? null,
    }));

    if (products.length === 0) return { status: 'empty' };
    return { status: 'ready', products };
  } catch (e: any) {
    return { status: 'error', message: 'No se pudo cargar el catálogo.' };
  }
}
