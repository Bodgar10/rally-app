// src/lib/__tests__/lado-y-mano.test.ts
import {
  COLUMNA_DE,
  avisoDeLaPareja,
  siguientePregunta,
  textoDeJugador,
  type PerfilDeJuego,
} from '@/lib/lado-y-mano';

const vacio: PerfilDeJuego = { lado: null, mano: null };

describe('qué se pregunta y cuándo', () => {
  it('primero el lado: desbloquea más cosas', () => {
    expect(siguientePregunta(vacio)!.id).toBe('lado');
  });

  it('contestado el lado, toca la mano', () => {
    expect(siguientePregunta({ lado: 'drive', mano: null })!.id).toBe('mano');
  });

  it('con todo contestado, NO SE PREGUNTA NADA MÁS', () => {
    expect(siguientePregunta({ lado: 'drive', mano: 'diestro' })).toBeNull();
  });

  it('lo saltado no se repite: insistir enseña a ignorar la tarjeta', () => {
    expect(siguientePregunta(vacio, ['lado'])!.id).toBe('mano');
    expect(siguientePregunta(vacio, ['lado', 'mano'])).toBeNull();
  });

  it('cada pregunta dice qué enciende y avisa de que es pública', () => {
    for (const saltadas of [[], ['lado']] as const) {
      const p = siguientePregunta(vacio, saltadas)!;
      expect(p.porque.length).toBeGreaterThan(20);
      expect(p.porque).toMatch(/rivales/);
    }
  });

  it('se contestan con botones: nunca menos de dos opciones ni campos libres', () => {
    for (const saltadas of [[], ['lado']] as const) {
      expect(siguientePregunta(vacio, saltadas)!.opciones.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('cada pregunta sabe en qué columna se guarda', () => {
    expect(COLUMNA_DE.lado).toBe('preferred_side');
    expect(COLUMNA_DE.mano).toBe('mano');
  });
});

describe('cómo se lee un jugador en la ficha', () => {
  it.each([
    [{ lado: 'reves', mano: 'zurdo' }, 'Zurdo, revés'],
    [{ lado: 'drive', mano: 'diestro' }, 'Diestro, drive'],
    [{ lado: 'ambos', mano: null }, 'Los dos lados'],
    [{ lado: null, mano: 'zurdo' }, 'Zurdo'],
  ] as const)('%o → "%s"', (perfil, esperado) => {
    expect(textoDeJugador(perfil as PerfilDeJuego)).toBe(esperado);
  });

  it('sin datos devuelve null, no una cadena vacía', () => {
    // Una línea con el nombre y nada al lado se lee como un dato que falló.
    expect(textoDeJugador(vacio)).toBeNull();
  });
});

describe('el aviso de la pareja rival', () => {
  it('EL ZURDO DE REVÉS SE DICE, Y SE EXPLICA POR QUÉ', () => {
    // Quien lleva años lo ve en el calentamiento; quien lleva uno, no.
    const aviso = avisoDeLaPareja(
      { lado: 'drive', mano: 'diestro' },
      { lado: 'reves', mano: 'zurdo' },
      'MARTÍNEZ',
      'RUIZ',
    );
    expect(aviso).toBe('RUIZ es zurdo por el revés: te va a cerrar el cruzado.');
  });

  it('lo detecta en cualquiera de los dos', () => {
    expect(
      avisoDeLaPareja({ lado: 'reves', mano: 'zurdo' }, { lado: 'drive', mano: 'diestro' }, 'A', 'B'),
    ).toMatch(/^A es zurdo/);
  });

  it('un zurdo de DRIVE no es noticia: eso es lo normal invertido', () => {
    const aviso = avisoDeLaPareja(
      { lado: 'drive', mano: 'zurdo' },
      { lado: 'reves', mano: 'diestro' },
      'A',
      'B',
    );
    expect(aviso).toBeNull();
  });

  it('los dos en el mismo lado: uno juega fuera de su sitio', () => {
    expect(
      avisoDeLaPareja({ lado: 'drive', mano: 'diestro' }, { lado: 'drive', mano: 'diestro' }, 'A', 'B'),
    ).toBe('Los dos juegan de drive: uno va a estar fuera de su lado.');
  });

  it('"los dos lados" no cuenta como coincidencia', () => {
    expect(
      avisoDeLaPareja({ lado: 'ambos', mano: null }, { lado: 'ambos', mano: null }, 'A', 'B'),
    ).toBeNull();
  });

  it('sin datos, calla', () => {
    expect(avisoDeLaPareja(vacio, vacio, 'A', 'B')).toBeNull();
  });
});
