/**
 * RALLY · WebShell
 * Shell de navegación y centrado para WEB únicamente.
 * Nunca se importa desde código nativo: el tab bar de iOS/Android
 * sigue viviendo en app/(protected)/_layout.tsx sin cambios.
 *
 * Qué hace:
 *   - Centra el contenido en una columna de ancho máximo (layout.contentMaxWidth),
 *     para que en monitores anchos no se estire de borde a borde.
 *   - Monta la navegación superior:
 *       · escritorio (width >= layout.desktopBreakpoint) → nav horizontal
 *       · web móvil  (width <  layout.desktopBreakpoint) → menú hamburguesa lateral
 *
 * Sin NativeWind (el proyecto no usa className en ninguna parte): StyleSheet + tokens.
 * Sin Drawer de expo-router ni react-native-gesture-handler: solo Modal + Pressable.
 */

import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { color, font, radius, space, touchTarget, layout } from '@/lib/design-tokens';

/**
 * Un destino de la navegación.
 *   href    → path para router.push. Sigue la convención del proyecto:
 *             grupo entre paréntesis incluido, y `/index` explícito donde
 *             la pantalla es el index de una carpeta (ver torneos).
 *   segment → primer segmento de la URL real. Los grupos entre paréntesis
 *             NO aparecen en la URL, así que /(protected)/torneos/index
 *             se sirve como /torneos. Se usa solo para marcar el activo.
 */
interface NavItem {
  label:   string;
  href:    string;
  segment: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Inicio',  href: '/(protected)/dashboard',     segment: 'dashboard' },
  { label: 'Torneos', href: '/(protected)/torneos',       segment: 'torneos'   },
  { label: 'Ranking', href: '/(protected)/ranking',       segment: 'ranking'   },
  { label: 'Pro',     href: '/(protected)/planes',        segment: 'planes'    },
  { label: 'Perfil',  href: '/(protected)/perfil',        segment: 'perfil'    },
];

/**
 * Marca activo el item cuyo segmento abre la ruta actual.
 * Con startsWith, el detalle de un torneo (/torneos/abc123) también
 * deja "Torneos" marcado, que es lo que se espera de una nav.
 */
function isActive(pathname: string, segment: string): boolean {
  return pathname === `/${segment}` || pathname.startsWith(`/${segment}/`);
}

export default function WebShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);

  const isDesktop = width >= layout.desktopBreakpoint;

  function go(href: string) {
    setMenuOpen(false);
    router.push(href);
  }

  return (
    <View style={styles.root}>
      {/* ── Barra superior ──────────────────────────────────────── */}
      {/* La barra ocupa todo el ancho (el borde inferior cruza la ventana),
          pero su contenido va en la misma columna que el contenido. */}
      <View style={styles.nav}>
        <View style={styles.navInner}>
        {isDesktop ? (
          <>
            <Text style={styles.wordmark}>RALLY</Text>
            <View style={styles.navItems}>
              {NAV_ITEMS.map(item => {
                const active = isActive(pathname, item.segment);
                return (
                  <Pressable
                    key={item.href}
                    onPress={() => go(item.href)}
                    accessibilityRole="link"
                    accessibilityLabel={item.label}
                  >
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            {/* Hamburguesa */}
            <Pressable
              onPress={() => setMenuOpen(true)}
              style={styles.burger}
              accessibilityRole="button"
              accessibilityLabel="Abrir menú"
            >
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
            </Pressable>

            <Text style={styles.wordmark}>RALLY</Text>

            {/* Espaciador del mismo ancho que la hamburguesa, para centrar el wordmark */}
            <View style={styles.burgerSpacer} />
          </>
        )}
        </View>
      </View>

      {/* ── Contenido centrado ──────────────────────────────────── */}
      <View style={styles.contentOuter}>
        <View style={styles.contentColumn}>{children}</View>
      </View>

      {/* ── Menú lateral (solo web móvil) ───────────────────────── */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          {/* Pressable vacío: absorbe el toque para que tocar el panel no cierre el menú */}
          <Pressable style={styles.panel} onPress={() => {}}>
            {NAV_ITEMS.map(item => {
              const active = isActive(pathname, item.segment);
              return (
                <Pressable
                  key={item.href}
                  onPress={() => go(item.href)}
                  style={[styles.panelItem, active && styles.panelItemActive]}
                  accessibilityRole="link"
                  accessibilityLabel={item.label}
                >
                  <Text style={[styles.panelLabel, active && styles.panelLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Estilos — tokens de design-tokens ───────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  // Barra superior — ancho completo, para que el borde cruce toda la ventana
  nav: {
    height:             layout.webNavHeight,
    borderBottomWidth:  1,
    borderBottomColor:  color.lineSoft,
  },
  // Contenido de la barra — centrado en la misma columna que el contenido
  navInner: {
    flex:               1,
    width:              '100%',
    maxWidth:           layout.contentMaxWidth,
    alignSelf:          'center',
    flexDirection:      'row',
    alignItems:         'center',
    justifyContent:     'space-between',
    paddingHorizontal:  space[6],
  },
  wordmark: {
    fontFamily:    font.display,
    fontSize:      13,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color:         color.gold,
  },

  // Nav horizontal (escritorio)
  navItems: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  navLabel: {
    fontFamily: 'Inter-Medium',
    fontSize:   14,
    color:      color.muted,
  },
  navLabelActive: { color: color.gold },

  // Hamburguesa (web móvil)
  burger: {
    minWidth:       touchTarget,
    minHeight:      touchTarget,
    alignItems:     'flex-start',
    justifyContent: 'center',
    gap:            4,
  },
  burgerLine: {
    width:           19,
    height:          1.5,
    backgroundColor: color.champagne,
  },
  burgerSpacer: { width: touchTarget },

  // Contenedor de contenido — ANCHO COMPLETO a propósito.
  // El centrado ya no vive aquí: lo aplica cada pantalla con
  // `webContentColumn` en el contentContainerStyle de su ScrollView.
  // Así el scroller ocupa toda la ventana, la rueda del mouse funciona
  // en cualquier punto y el scrollbar queda pegado al borde derecho.
  contentOuter:   { flex: 1 },
  contentColumn:  { flex: 1, width: '100%' },

  // Menú lateral
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(6,6,8,0.72)',
    flexDirection:   'row',
    justifyContent:  'flex-end',
  },
  panel: {
    width:           274,
    backgroundColor: '#101015',
    borderLeftWidth: 1,
    borderLeftColor: color.line,
    padding:         space[5],
  },
  panelItem: {
    paddingVertical:   space[3],
    paddingHorizontal: space[3],
  },
  panelItemActive: {
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderRadius:    radius.sm,
  },
  panelLabel: {
    fontFamily: font.body,
    fontSize:   15,
    color:      color.muted,
  },
  panelLabelActive: { color: color.gold },
});
