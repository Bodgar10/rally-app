/**
 * RALLY · Íconos de trazo
 *
 * SVG outline con `react-native-svg` (15.15.4, la versión que fija el SDK 56).
 * Trazo, no relleno: el sistema visual es de líneas finas (hairlines dorados,
 * barras de acento), y un ícono sólido rompería esa lectura.
 *
 * Convención: 24×24 de viewBox, `strokeWidth` 1.5, extremos redondeados.
 * El color se hereda del prop, así que un mismo ícono sirve en muted, gold,
 * alive o danger sin duplicar el path.
 *
 * Reemplaza a los emojis en las filas del panel. Los emojis del tab bar
 * ((protected)/_layout.tsx) siguen ahí y pueden migrar aquí más adelante.
 */

import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';

import { color } from '@/lib/design-tokens';

export type IconName =
  | 'calendar'
  | 'pin'
  | 'grid'
  | 'money'
  | 'clock'
  | 'whistle'
  | 'users'
  | 'userPlus'
  | 'trash'
  | 'flag'
  | 'chevron'
  | 'check';

interface Props {
  name:    IconName;
  size?:   number;
  color?:  string;
  /** Grosor del trazo. 1.5 por defecto, en línea con los hairlines del sistema. */
  width?:  number;
}

export default function Icon({ name, size = 20, color: stroke = color.muted, width = 1.5 }: Props) {
  const common = {
    stroke,
    strokeWidth: width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'calendar' && (
        <>
          <Path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...common} />
          <Line x1="4" y1="9" x2="20" y2="9" {...common} />
          <Line x1="8" y1="2.5" x2="8" y2="5.5" {...common} />
          <Line x1="16" y1="2.5" x2="16" y2="5.5" {...common} />
        </>
      )}

      {name === 'pin' && (
        <>
          <Path d="M12 21c4-4.5 7-7.8 7-11a7 7 0 1 0-14 0c0 3.2 3 6.5 7 11z" {...common} />
          <Circle cx="12" cy="10" r="2.5" {...common} />
        </>
      )}

      {name === 'grid' && (
        <>
          <Path d="M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z" {...common} />
        </>
      )}

      {name === 'money' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Line x1="12" y1="7" x2="12" y2="17" {...common} />
          <Path d="M14.5 9.5A2.5 2.5 0 0 0 12 8.5h-.5a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4H12a2.5 2.5 0 0 1-2.5-1" {...common} />
        </>
      )}

      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Polyline points="12,7 12,12 15.5,14" {...common} />
        </>
      )}

      {name === 'whistle' && (
        <>
          {/* Silbato: cuerpo redondo con boquilla y cordón */}
          <Circle cx="9.5" cy="14" r="5.5" {...common} />
          <Path d="M15 12h5.5a1 1 0 0 1 0 3H15" {...common} />
          <Path d="M9.5 8.5V5a1 1 0 0 1 1-1h3" {...common} />
        </>
      )}

      {name === 'users' && (
        <>
          <Circle cx="9" cy="8" r="3.5" {...common} />
          <Path d="M3.5 20a5.5 5.5 0 0 1 11 0" {...common} />
          <Path d="M16 5.2a3.5 3.5 0 0 1 0 5.6" {...common} />
          <Path d="M17.5 14.6a5.5 5.5 0 0 1 3 5.4" {...common} />
        </>
      )}

      {name === 'userPlus' && (
        <>
          <Circle cx="9.5" cy="8" r="3.5" {...common} />
          <Path d="M3.5 20a6 6 0 0 1 12 0" {...common} />
          <Line x1="18.5" y1="7" x2="18.5" y2="13" {...common} />
          <Line x1="15.5" y1="10" x2="21.5" y2="10" {...common} />
        </>
      )}

      {name === 'trash' && (
        <>
          <Polyline points="4,6.5 20,6.5" {...common} />
          <Path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" {...common} />
          <Path d="M6.5 6.5l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13" {...common} />
        </>
      )}

      {name === 'flag' && (
        <>
          <Line x1="6" y1="3.5" x2="6" y2="21" {...common} />
          <Path d="M6 4.5h11l-2.5 4 2.5 4H6z" {...common} />
        </>
      )}

      {name === 'chevron' && <Polyline points="9,5 16,12 9,19" {...common} />}

      {name === 'check' && <Polyline points="5,12.5 10,17.5 19,7" {...common} />}
    </Svg>
  );
}
