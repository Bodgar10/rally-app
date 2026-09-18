// src/lib/__tests__/tarjetas-compartibles.test.ts
import {
  tarjetaDeCampeon,
  tarjetaDeNivel,
  tarjetaDelPartido,
  urlDeLaApp,
} from '@/lib/tarjetas-compartibles';

describe('la regla de todos los textos', () => {
  const todos = [
    tarjetaDeCampeon('Cuarta Varonil', 'Exprés Dominical', 'Ana / Beto').mensaje,
    tarjetaDeNivel('Tercera', 112, 40)!.mensaje,
    tarjetaDelPartido('Martínez / Ruiz', 0.38).mensaje,
  ];

  it('EL DATO VA PRIMERO, el nombre de la app al final', () => {
    // Nadie comparte un anuncio. Un texto que empieza por la marca no lo manda
    // nadie, y entonces no sirve para nada.
    for (const m of todos) {
      expect(m.startsWith('RALLY')).toBe(false);
      expect(m.trimEnd().endsWith(urlDeLaApp())).toBe(true);
    }
  });

  it('el enlace sale una sola vez', () => {
    for (const m of todos) {
      expect(m.split(urlDeLaApp()).length - 1).toBe(1);
    }
  });

  it('nada de signos de admiración ni de urgencia', () => {
    for (const m of todos) {
      expect(m).not.toMatch(/¡|!|descarga|regístrate|gratis/i);
    }
  });
});

describe('campeón', () => {
  it('con todo, dice categoría, torneo y quiénes', () => {
    const t = tarjetaDeCampeon('Cuarta Varonil', 'Exprés Dominical', 'Ana / Beto');
    expect(t.mensaje).toMatch(/Campeones de Cuarta Varonil en Exprés Dominical/);
    expect(t.mensaje).toMatch(/Ana \/ Beto/);
  });

  it('SIN torneo ni nombres sigue siendo una tarjeta, no una frase rota', () => {
    // La pantalla que la usa solo conoce la categoría. Un "Campeones de Cuarta
    // Varonil en ." o un "undefined" arruinarían justo el mensaje que más se
    // comparte del año.
    const t = tarjetaDeCampeon('Cuarta Varonil');
    expect(t.mensaje).toMatch(/^🏆 Campeones de Cuarta Varonil\.\n/);
    expect(t.mensaje).not.toMatch(/undefined|null| en \./);
  });

  it('con torneo pero sin nombres tampoco deja huecos', () => {
    expect(tarjetaDeCampeon('Cuarta Varonil', 'Exprés Dominical').mensaje).toMatch(
      /^🏆 Campeones de Cuarta Varonil en Exprés Dominical\.\n/,
    );
  });
});

describe('nivel', () => {
  it('con subida, la cuenta en primera persona', () => {
    expect(tarjetaDeNivel('Tercera', 112, 40)!.mensaje).toMatch(
      /\+112 puntos de nivel desde que empecé\. Voy en tercera\./,
    );
  });

  it('con pocos partidos cambia el marco temporal', () => {
    expect(tarjetaDeNivel('Quinta', 40, 6)!.mensaje).toMatch(/en mis primeros torneos/);
  });

  it('NO SE OFRECE SI BAJÓ', () => {
    // Nadie comparte "bajé 40 puntos", y ofrecérselo es recordarle un mal fin
    // de semana justo cuando abre la app.
    expect(tarjetaDeNivel('Tercera', -40, 40)).toBeNull();
    expect(tarjetaDeNivel('Tercera', 0, 40)).toBeNull();
  });
});

describe('el partido que viene', () => {
  it('de favorito, se presume', () => {
    expect(tarjetaDelPartido('Martínez / Ruiz', 0.72).mensaje).toMatch(
      /Me dan 72%\. A ver si es verdad\./,
    );
  });

  it('EN CONTRA TAMBIÉN SE COMPARTE, y por eso hay remate para eso', () => {
    // Un pronóstico desfavorable se manda más que uno a favor: sirve para
    // picar a la pareja.
    expect(tarjetaDelPartido('Martínez / Ruiz', 0.38).mensaje).toMatch(
      /Me dan 38%\. Vamos a dar la sorpresa\./,
    );
  });

  it('parejo tiene su propio remate', () => {
    expect(tarjetaDelPartido('X / Y', 0.5).mensaje).toMatch(/se decide en la cancha/);
  });

  it('sin porcentaje fiable, no se inventa uno', () => {
    const m = tarjetaDelPartido('X / Y', null).mensaje;
    expect(m).toMatch(/Hoy contra X \/ Y\./);
    expect(m).not.toMatch(/%/);
  });
});
