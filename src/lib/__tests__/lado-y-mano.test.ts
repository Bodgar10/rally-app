// src/lib/__tests__/lado-y-mano.test.ts
import {
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
      { lado: 'drive', mano: 'zurdo' },
      'MARTÍNEZ',
      'RUIZ',
    );
    expect(aviso).toBe('RUIZ es zurdo por el drive: te va a cerrar el cruzado.');
  });

  it('lo detecta en cualquiera de los dos', () => {
    expect(
      avisoDeLaPareja({ lado: 'drive', mano: 'zurdo' }, { lado: 'reves', mano: 'diestro' }, 'A', 'B'),
    ).toMatch(/^A es zurdo/);
  });

  // Un zurdo en el revés está fuera de su sitio: es raro, pero no es la
  // configuración que cierra el cruzado, así que no se avisa de ella.
  it('un zurdo de REVÉS no es noticia: no es el que cierra el cruzado', () => {
    const aviso = avisoDeLaPareja(
      { lado: 'reves', mano: 'zurdo' },
      { lado: 'drive', mano: 'diestro' },
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

describe('el ritmo: contestar avanza, cerrar no', () => {
  // La lógica de la tarjeta vive en el componente, pero la regla que decide
  // QUÉ se pregunta es esta, y es la que hay que poder fijar.

  it('contestar el lado deja la mano pendiente para el momento', () => {
    // Contestar es cooperar: se le ofrece la siguiente ahí mismo, porque las
    // aperturas de esta app son pocas —solo días de torneo— y desaprovechar
    // una es caro.
    expect(siguientePregunta(vacio, ['lado'])!.id).toBe('mano');
  });

  it('con las dos contestadas ya no queda nada que preguntar', () => {
    expect(siguientePregunta({ lado: 'drive', mano: 'zurdo' }, [])).toBeNull();
    expect(siguientePregunta(vacio, ['lado', 'mano'])).toBeNull();
  });

  it('y una contestada de verdad no vuelve aunque se reinicie la sesión', () => {
    // Lo contestado está en la base: la lista de "ya preguntadas en esta
    // sesión" se puede perder sin que nadie vuelva a ver la pregunta.
    expect(siguientePregunta({ lado: 'drive', mano: null }, [])!.id).toBe('mano');
  });
});
