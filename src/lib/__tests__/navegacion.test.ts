// src/lib/__tests__/navegacion.test.ts
//
// A dónde vuelve el botón de volver cuando NO hay historial: entrando por
// `replace`, por URL directa o tras recargar la página en web. Antes en esos
// tres casos no volvía a ningún sitio, porque `router.back()` no hace nada sin
// historial.

import { rutaPadre, DESTINO_POR_DEFECTO } from '@/lib/navegacion';

describe('rutaPadre — el caso normal es quitar el último segmento', () => {
  it.each([
    ['/org/torneos/abc123/canchas',  '/org/torneos/abc123'],
    ['/org/torneos/abc123/grupos',   '/org/torneos/abc123'],
    ['/org/torneos/abc123/jueces',   '/org/torneos/abc123'],
    ['/torneos/abc123/cat456',       '/torneos/abc123'],
    ['/torneos/abc123',              '/torneos'],
    ['/juez/abc123',                 '/juez'],
    ['/organizador/nuevo',           '/organizador'],
  ])('%s → %s', (actual, esperado) => {
    expect(rutaPadre(actual)).toBe(esperado);
  });
});

describe('rutaPadre — donde la jerarquía de archivos no es la del producto', () => {
  it('/org/torneos/nuevo vuelve al panel: /org/torneos no es una pantalla', () => {
    expect(rutaPadre('/org/torneos/nuevo')).toBe('/(organizer)/org');
  });

  it('la inscripción vuelve a los torneos del jugador', () => {
    expect(rutaPadre('/inscripcion/abc123')).toBe('/(protected)/torneos');
    expect(rutaPadre('/inscripcion/abc123/pago')).toBe('/(protected)/torneos');
  });
});

describe('rutaPadre — cuando no hay padre dentro de la app', () => {
  it('una pantalla de primer nivel cae al dashboard', () => {
    expect(rutaPadre('/perfil')).toBe(DESTINO_POR_DEFECTO);
    expect(rutaPadre('/organizador')).toBe(DESTINO_POR_DEFECTO);
  });

  it('las públicas caen a la portada: se leen SIN sesión', () => {
    // Mandarlas al dashboard rebotaría a login a quien solo vino a leer los
    // términos desde un enlace.
    for (const p of ['/privacidad', '/terminos', '/reembolso', '/ayuda', '/como-cancelar']) {
      expect(rutaPadre(p)).toBe('/');
    }
  });

  it('la raíz y lo vacío caen al dashboard sin reventar', () => {
    expect(rutaPadre('/')).toBe(DESTINO_POR_DEFECTO);
    expect(rutaPadre('')).toBe(DESTINO_POR_DEFECTO);
  });
});

describe('rutaPadre — higiene de la entrada', () => {
  it('ignora la barra final', () => {
    expect(rutaPadre('/torneos/abc123/')).toBe('/torneos');
  });

  it('ignora la query', () => {
    expect(rutaPadre('/torneos/abc123?foo=1')).toBe('/torneos');
  });
});
