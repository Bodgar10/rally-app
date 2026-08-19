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
  bottomInset,
} from '../web-layout';

describe('web-layout · nativo — debe ser inerte', () => {
  it.each(['ios', 'android'])('en %s, webContentColumn es un objeto vacío', (os) => {
    const { webContentColumn: col } = resolveWebLayout(os);

    // La garantía que sostiene "iOS y Android no cambian ni un píxel":
    // spreadear {} en un StyleSheet no añade ninguna clave.
    expect(col).toEqual({});
    expect(Object.keys(col)).toHaveLength(0);
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
});
