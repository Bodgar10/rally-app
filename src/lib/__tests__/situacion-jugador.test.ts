// Lo que el jugador lee sobre su propia situación.
//
// Se prueban las FRASES, no el motor: `clinch_status` ya lo calcula y lo cubre
// `src/lib/engine/clinch`. Lo que aquí puede romperse es que la traducción diga
// algo distinto de lo que el motor decidió — y eso lo lee alguien que está en el
// club, de noche, decidiendo si mañana se levanta a las siete.

import {
  situacionDe, gruposSinTerminar, porQueNoHayPartido,
  type ClinchStatus,
} from '@/lib/situacion-jugador';

describe('la situación, en lenguaje de jugador', () => {
  it('no enseña el vocabulario del motor', () => {
    const estados: ClinchStatus[] = ['clinched', 'repechage_pending', 'alive', 'eliminated'];
    for (const e of estados) {
      const s = situacionDe(e, 2);
      const texto = `${s.titulo} ${s.detalle}`;
      expect(texto).not.toMatch(/clinch|repechage|pending|alive|eliminated/i);
      expect(s.titulo.length).toBeGreaterThan(5);
      expect(s.detalle.length).toBeGreaterThan(10);
    }
  });

  it('quien clasificó sabe que solo le queda esperar', () => {
    const s = situacionDe('clinched', 3);
    expect(s.tono).toBe('clasificado');
    expect(s.titulo).toMatch(/clasificaste/i);
    expect(s.detalle).toMatch(/espera/i);
  });

  it('el repechaje dice las DOS cosas: ya no primero, todavía vivo', () => {
    const s = situacionDe('repechage_pending', 3);
    // Se lee entero: el título lleva la buena noticia y el detalle el límite.
    const texto = `${s.titulo} ${s.detalle}`;
    expect(texto).toMatch(/no puedes ser primero/i);
    expect(texto).toMatch(/mejor segundo/i);
  });

  // El número es lo que convierte la incertidumbre en espera acotada.
  it('el repechaje dice cuántos grupos faltan', () => {
    expect(situacionDe('repechage_pending', 3).detalle).toContain('Faltan 3 grupos');
    expect(situacionDe('repechage_pending', 1).detalle).toContain('Falta 1 grupo');
    expect(situacionDe('repechage_pending', 0).detalle).toMatch(/ya terminaron todos/i);
  });

  it('el eliminado se lee sin dramatismo ni culpa', () => {
    const s = situacionDe('eliminated', 0);
    expect(s.tono).toBe('fuera');
    expect(`${s.titulo} ${s.detalle}`).toMatch(/gracias/i);
    // Ni error ni fracaso: quedarse fuera pasa en la mitad de los cuadros.
    expect(`${s.titulo} ${s.detalle}`).not.toMatch(/error|fallo|perdiste|lo sentimos/i);
  });

  it('el que sigue vivo sabe que depende de él', () => {
    expect(situacionDe('alive', 5).tono).toBe('vivo');
    expect(situacionDe('alive', 5).detalle).toMatch(/tus partidos/i);
  });
});

describe('gruposSinTerminar', () => {
  it('un grupo cuenta como pendiente si le falta UN partido', () => {
    expect(gruposSinTerminar([
      { groupId: 'a', finished: true },
      { groupId: 'a', finished: false },
      { groupId: 'b', finished: true },
    ])).toBe(1);
  });

  it('no cuenta dos veces el mismo grupo', () => {
    expect(gruposSinTerminar([
      { groupId: 'a', finished: false },
      { groupId: 'a', finished: false },
      { groupId: 'a', finished: false },
    ])).toBe(1);
  });

  it('los partidos de eliminatoria no son un grupo', () => {
    expect(gruposSinTerminar([{ groupId: null, finished: false }])).toBe(0);
  });

  it('todo terminado es cero', () => {
    expect(gruposSinTerminar([
      { groupId: 'a', finished: true }, { groupId: 'b', finished: true },
    ])).toBe(0);
  });
});

describe('por qué no hay próximo partido', () => {
  // Callarse era lo peor: no se distingue "la app se rompió" de "todavía no se
  // puede saber", y lo segundo es casi siempre la respuesta.
  it('nunca devuelve vacío', () => {
    const casos: Array<ClinchStatus | null> = ['clinched', 'repechage_pending', 'alive', 'eliminated', null];
    for (const e of casos) {
      expect(porQueNoHayPartido(e, 2).length).toBeGreaterThan(20);
    }
  });

  it('al que ya clasificó le explica que su cruce depende de otros grupos', () => {
    expect(porQueNoHayPartido('clinched', 3)).toMatch(/depende/i);
    expect(porQueNoHayPartido('clinched', 3)).toContain('3 grupos');
    // Sin grupos pendientes ya no hay nada de qué depender.
    expect(porQueNoHayPartido('clinched', 0)).not.toMatch(/depende/i);
  });

  it('al eliminado no le promete partidos que no va a jugar', () => {
    expect(porQueNoHayPartido('eliminated', 5)).toMatch(/no tienes más partidos/i);
  });
});

describe('de qué partidos depende', () => {
  // Hoy el motor no los enumera, así que la lista llega vacía y el texto es el
  // genérico. Lo que se fija aquí es que el sitio esté hecho y que el genérico
  // no finja concreción que no tiene.
  it('sin partidos concretos, dependeDe está vacío', () => {
    expect(situacionDe('alive', 2).dependeDe).toEqual([]);
    expect(situacionDe('repechage_pending', 2).dependeDe).toEqual([]);
  });

  it('quien ya clasificó o quedó fuera no depende de nada', () => {
    // Ni siquiera si alguien le pasa una lista: ya no hay nada que esperar.
    const fake = [{ partido: 'A vs B', queTeConviene: 'que gane A' }];
    expect(situacionDe('clinched', 3, fake).dependeDe).toEqual([]);
    expect(situacionDe('eliminated', 3, fake).dependeDe).toEqual([]);
  });

  it('con partidos concretos, el texto cambia de forma', () => {
    const uno = situacionDe('alive', 2, [
      { partido: 'Luis / Pedro vs Sofía / Regina', queTeConviene: 'que ganen Luis / Pedro' },
    ]);
    expect(uno.dependeDe).toHaveLength(1);
    expect(uno.detalle).toMatch(/este partido/i);
    // Ya no es la frase vacía.
    expect(uno.detalle).not.toMatch(/lo que pase en tus partidos/i);

    const dos = situacionDe('alive', 2, [
      { partido: 'A vs B', queTeConviene: 'que gane A' },
      { partido: 'C vs D', queTeConviene: 'que gane D' },
    ]);
    expect(dos.detalle).toMatch(/estos 2 partidos/i);
  });

  // "Depende de lo que pase en tus partidos" era cierto y vacío: el jugador ya
  // sabe que depende de algo. Al menos se dice que el detalle llegará.
  it('el genérico admite que todavía no se sabe', () => {
    expect(situacionDe('alive', 2).detalle).toMatch(/aparecerá aquí|cuando se sepa/i);
  });
});
