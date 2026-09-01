// src/lib/__tests__/web-layout.test.ts
//
// Fija el contrato de @/lib/web-layout en las tres plataformas.
//
// COBERTURA (ver el reporte del PASO 1):
//   - La suite corre bajo un solo entorno. El preset `jest-expo` de
//     jest.config.js hereda `haste.defaultPlatform: 'ios'` de
//     @react-native/jest-preset, así que Platform.OS === 'ios'.
//   - Las CONSTANTES EXPORTADAS se verifican de verdad, tal como las
//     importarán las pantallas, bajo esa plataforma real (ios).
//   - Las ramas de 'android' y 'web' se verifican a través de la función
//     pura `resolveWebLayout`, sin mockear react-native. Mockear el módulo
//     rompe la cadena que el preset monta para NativeWind/css-interop
//     (`Appearance.getColorScheme` de react-native-css-interop revienta).

import {
  resolveWebLayout,
  webContentColumn,
  webContentColumnAncha,
  bottomInset,
  inputFontSize,
} from '../web-layout';

// Los cuatro tamaños de fuente que usan hoy los TextInput del proyecto.
// Si aparece un quinto, añádelo aquí: el invariante debe cubrirlos todos.
const TAMANOS_NATIVOS_REALES = [
  12, // fontSize.body — los 4 archivos de (auth), org/torneos/nuevo, partnerInput
  13, // inline — org/torneos/[tournamentId], CancellationFlow (textarea)
  14, // inline — agregar-pareja
  28, // inline — ScoreCapture; ya cumple el umbral, no debe tocarse
] as const;

describe('web-layout · nativo — debe ser inerte', () => {
  it.each(['ios', 'android'])('en %s, webContentColumn es un objeto vacío', (os) => {
    const { webContentColumn: col } = resolveWebLayout(os);

    // La garantía que sostiene "iOS y Android no cambian ni un píxel":
    // spreadear {} en un StyleSheet no añade ninguna clave.
    expect(col).toEqual({});
    expect(Object.keys(col)).toHaveLength(0);
  });

  // La columna ancha (pantallas de rejilla) tiene que ser inerte por la MISMA
  // razón: app.json declara ios.supportsTablet, y un maxWidth caparía el
  // contenido en iPad.
  it.each(['ios', 'android'])('en %s, webContentColumnAncha es un objeto vacío', (os) => {
    const { webContentColumnAncha: col } = resolveWebLayout(os);
    expect(col).toEqual({});
    expect(Object.keys(col)).toHaveLength(0);
  });

  it('la constante exportada también es inerte bajo la plataforma real (ios)', () => {
    expect(webContentColumnAncha).toEqual({});
  });

  it('en web, la ancha es MÁS ancha que la de lectura', () => {
    const { webContentColumn: lectura, webContentColumnAncha: ancha } = resolveWebLayout('web');
    expect(Number(ancha.maxWidth)).toBeGreaterThan(Number(lectura.maxWidth));
    // Y las dos siguen centrando igual: la única diferencia es la medida.
    expect(ancha.alignSelf).toBe('center');
    expect(ancha.width).toBe('100%');
  });

  it.each(['ios', 'android'])('en %s, NO se filtra ningún maxWidth (iPad)', (os) => {
    const { webContentColumn: col } = resolveWebLayout(os);

    // app.json declara ios.supportsTablet: true — un maxWidth aquí caparía iPad.
    expect(col.maxWidth).toBeUndefined();
    expect(col.alignSelf).toBeUndefined();
    expect(col.width).toBeUndefined();
  });

  it.each(['ios', 'android'])('en %s, bottomInset son 48 (tab bar de 86px)', (os) => {
    expect(resolveWebLayout(os).bottomInset).toBe(48);
  });

  it.each(['ios', 'android'])('en %s, el acceso a Organizar va en el header', (os) => {
    // No hay nav lateral y un sexto tab no cabe: el header es el único sitio.
    expect(resolveWebLayout(os).organizerEntryInHeader).toBe(true);
  });

  // El invariante que sostiene "iOS y Android no cambian ni un píxel" para los
  // campos de texto: en nativo `inputFontSize` es la identidad, sin excepciones.
  describe.each(['ios', 'android'])('en %s, inputFontSize es la identidad', (os) => {
    it.each(TAMANOS_NATIVOS_REALES)('deja %i intacto', (size) => {
      expect(resolveWebLayout(os).inputFontSize(size)).toBe(size);
    });

    it('no eleva NINGÚN tamaño, ni siquiera por debajo del umbral de Safari', () => {
      const fn = resolveWebLayout(os).inputFontSize;

      // Barrido exhaustivo: si alguien mete un Math.max sin la rama de web,
      // este test lo caza aunque el tamaño no esté en la tabla de arriba.
      for (let size = 1; size <= 40; size++) {
        expect(fn(size)).toBe(size);
      }
    });
  });
});

describe('web-layout · web — debe centrar y reducir el relleno', () => {
  it('webContentColumn limita el ancho y centra', () => {
    expect(resolveWebLayout('web').webContentColumn).toEqual({
      maxWidth:  720,
      alignSelf: 'center',
      width:     '100%',
    });
  });

  it('bottomInset baja a 24 (en web no hay tab bar)', () => {
    expect(resolveWebLayout('web').bottomInset).toBe(24);
  });

  it('el acceso a Organizar NO va en el header (ya está en el nav de WebShell)', () => {
    // Si esto fuera true, el botón saldría duplicado en la misma vista.
    expect(resolveWebLayout('web').organizerEntryInHeader).toBe(false);
  });

  describe('inputFontSize eleva a 16 para no disparar el zoom de Safari iOS', () => {
    // Safari hace zoom automático al enfocar un campo por debajo de 16px, y con
    // `body { overflow: hidden }` del reset de RNW ese zoom no se revierte solo.
    it.each([
      [12, 16], // fontSize.body — el caso de login y registro
      [13, 16],
      [14, 16],
      [28, 28], // ya cumple: se respeta, no se aplasta a 16
    ])('%i sube a %i', (nativo, esperado) => {
      expect(resolveWebLayout('web').inputFontSize(nativo)).toBe(esperado);
    });

    it('ningún tamaño queda por debajo del umbral', () => {
      const fn = resolveWebLayout('web').inputFontSize;

      for (let size = 1; size <= 40; size++) {
        expect(fn(size)).toBeGreaterThanOrEqual(16);
      }
    });

    it('nunca REDUCE un tamaño que ya cumplía', () => {
      const fn = resolveWebLayout('web').inputFontSize;

      for (let size = 16; size <= 80; size++) {
        expect(fn(size)).toBe(size);
      }
    });
  });
});

describe('web-layout · las constantes exportadas, en la plataforma real del preset', () => {
  it('Platform.OS del preset es ios', () => {
    // Si algún día se cambia jest.config.js a un preset multiplataforma,
    // este test avisa: dejaría de ser ios y habría que revisar lo de arriba.
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    expect(Platform.OS).toBe('ios');
  });

  it('webContentColumn y bottomInset resuelven a los valores nativos', () => {
    // Esto NO pasa por resolveWebLayout: comprueba lo que realmente
    // importarán las pantallas.
    expect(webContentColumn).toEqual({});
    expect(bottomInset).toBe(48);
  });

  it('inputFontSize resuelve a la identidad en los cuatro tamaños reales', () => {
    // La constante que de verdad importan los 4 archivos de (auth).
    for (const size of TAMANOS_NATIVOS_REALES) {
      expect(inputFontSize(size)).toBe(size);
    }
  });
});
