/**
 * RALLY · Design Tokens
 * Fuente única de verdad visual (Doc D §11.1).
 * Importar de aquí en TODOS los componentes. CERO hex literales en componentes.
 * Pareja: tailwind.config.js (mismos valores, en formato Tailwind).
 */

export const color = {
  // —— Base (Doc D §2.1) ——————————————————————————————————————
  bg:          '#0B0B0D',   // Fondo base de la app (negro ónix)
  surface:     '#17171C',   // Superficie de tarjeta estándar
  surface2:    '#202027',   // Superficie elevada / inputs / segmentos
  text:        '#F4F1E9',   // Texto primario (blanco cálido)
  muted:       '#928E84',   // Texto secundario, labels, captions
  champagne:   '#E9DDB6',   // Texto/acento dorado suave
  gold:        '#D4AF37',   // Oro primario (acento, bordes activos)
  goldBright:  '#F1D98C',   // Brillo de oro (números hero)
  goldDeep:    '#9C7A28',   // Oro profundo (sombra del gradiente)
  line:        'rgba(212,175,55,0.16)',   // Línea dorada hairline
  lineSoft:    'rgba(255,255,255,0.06)', // Línea neutra hairline

  // —— Semánticos (Doc D §2.2) ————————————————————————————————
  live:        '#42D6A4',   // En vivo, victoria, positivo
  alive:       '#E6B450',   // "Dependes de…" / pendiente
  danger:      '#E0726F',   // Eliminado, urgencia
  wine:        '#7E2C3D',   // Realce / promoción / suscripción
  wineDeep:    '#4A141F',   // Fondo profundo del gradiente granate

  // —— Texto sobre fondos de color (Doc D §2.4) ————————————————
  onGold:      '#1A1407',   // Texto sobre botón/sello dorado
  onWine:      '#F7EAC6',   // Texto sobre fondo granate
} as const;

export const gradient = {
  // Doc D §2.3 — gradientes oficiales (NO crear otros)
  // Para uso con expo-linear-gradient: pasar colors[] y start/end
  gold: {
    // grad-gold: linear-gradient(150deg, #F1D98C, #D4AF37)
    colors: ['#F1D98C', '#D4AF37'] as const,
    start:  { x: 0, y: 0 } as const,
    end:    { x: 1, y: 1 } as const,
  },
  seal: {
    // grad-seal: linear-gradient(150deg, #F1D98C, #9C7A28)
    colors: ['#F1D98C', '#9C7A28'] as const,
    start:  { x: 0, y: 0 } as const,
    end:    { x: 1, y: 1 } as const,
  },
  hero: {
    // grad-hero: linear-gradient(160deg, #241F12, #19171A, #141318)
    colors: ['#241F12', '#19171A', '#141318'] as const,
    start:  { x: 0, y: 0 } as const,
    end:    { x: 1, y: 1 } as const,
  },
  wine: {
    // grad-wine: linear-gradient(150deg, #7E2C3D, #4A141F)
    colors: ['#7E2C3D', '#4A141F'] as const,
    start:  { x: 0, y: 0 } as const,
    end:    { x: 1, y: 1 } as const,
  },
  rule: {
    // grad-rule: barra horizontal de acento en tarjetas destacadas
    colors: ['#9C7A28', '#F1D98C', '#9C7A28'] as const,
    start:  { x: 0, y: 0 } as const,
    end:    { x: 1, y: 0 } as const,
  },
} as const;

export const radius = {
  // Doc D §5 — radios de esquina
  xs:   7,
  sm:   11,
  md:   13,
  lg:   16,
  xl:   18,
  xl2:  24,
  pill: 9999,
} as const;

export const space = {
  // Doc D §4 — escala de espaciado (en px para StyleSheet)
  1:   4,
  1.5: 6,
  2:   8,
  2.5: 10,
  3:   12,
  3.5: 14,
  4:   16,
  4.5: 18,
  5:   20,
  6:   24,
} as const;

export const font = {
  // Doc D §3 — dos familias, nada más
  display: 'Oswald',
  body:    'Inter',
} as const;

export const fontSize = {
  // Doc D §3.1 — escala tipográfica.
  // Subida de 1-2px por escalón: la escala original se leía demasiado pequeña,
  // sobre todo en web. Se mantiene la jerarquía relativa entre escalones.
  // GEMELO: tailwind.config.js tiene estos mismos valores en formato Tailwind.
  // Si tocas uno, toca el otro.
  displayXl:   76,
  displayL:    42,
  screenH1:    30,
  metric:      24,
  h1Inline:    19,
  cardName:    17,
  section:     14,
  eyebrow:     12,
  body:        14,
  caption:     12,
  minAbsolute: 12,
} as const;

export const touchTarget = 44; // Doc D §4 — mínimo 44×44px

export const layout = {
  // Ancho máximo de la columna de contenido en web.
  // En móvil (nativo y web) no aplica: el contenido ocupa todo el ancho.
  contentMaxWidth: 720,
  // A partir de este ancho de ventana, web usa nav horizontal.
  // Por debajo, usa menú hamburguesa. Solo aplica en web.
  desktopBreakpoint: 900,
  // Alto de la barra de navegación superior en web.
  webNavHeight: 64,
} as const;

// —— Re-export agrupado (import { T } from '@/lib/design-tokens') ———
export const T = { color, gradient, radius, space, font, fontSize, touchTarget, layout } as const;
export default T;
