/**
 * RALLY · Una lectura que no se rinde a la primera
 *
 * (Estas pruebas vivían en `siguiente-ronda.test.ts`. Se mudaron con el módulo
 * cuando la lectura pasó a ser compartida por las dos tarjetas del jugador.)
 */

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

import { esFalloDeTransporte, leerConReintento } from '../lectura-reintentada';

/**
 * CALLARSE PORQUE NO HAY NADA Y CALLARSE PORQUE NO SE PUDO LEER
 *
 * Las dos cosas devolvían `null` y la tarjeta desaparecía igual, con un
 * `console.warn` que además decía `undefined`. Un fallo de red apagaba la
 * tarjeta de alguien que SÍ estaba en la final, sin dejar nada que mirar.
 */
describe('distinguir el fallo de la ausencia', () => {
  /** Un error de Postgres o de PostgREST: siempre trae `code`. */
  const DE_LA_BASE = { code: '42501', message: 'permission denied', details: null, hint: null };
  /** Un `fetch` que ni salió: en la sonda real llegó así, vacío. */
  const DE_TRANSPORTE = {};

  it('lo que dice la base NO se reintenta: daría lo mismo', () => {
    expect(esFalloDeTransporte(DE_LA_BASE)).toBe(false);
    expect(esFalloDeTransporte({ code: 'PGRST116', message: 'no rows' })).toBe(false);
  });

  it('lo que impidió hablar con la base SÍ', () => {
    expect(esFalloDeTransporte(DE_TRANSPORTE)).toBe(true);
    expect(esFalloDeTransporte({ code: '', message: 'TypeError: fetch failed' })).toBe(true);
    expect(esFalloDeTransporte(new TypeError('Network request failed'))).toBe(true);
  });

  it('a la primera que va bien, no se reintenta nada', async () => {
    let intentos = 0;
    const r = await leerConReintento('prueba', async () => {
      intentos++;
      return { data: [1, 2], error: null };
    }, [1, 1]);
    expect(r).toEqual({ ok: true, data: [1, 2] });
    expect(intentos).toBe(1);
  });

  it('un fallo de transporte se reintenta y puede acabar bien', async () => {
    let intentos = 0;
    const r = await leerConReintento('prueba', async () => {
      intentos++;
      return intentos < 3 ? { data: null, error: DE_TRANSPORTE } : { data: ['ya'], error: null };
    }, [1, 1]);
    expect(r).toEqual({ ok: true, data: ['ya'] });
    expect(intentos).toBe(3);
  });

  it('agotados los intentos se rinde, pero diciendo que NO pudo', async () => {
    let intentos = 0;
    const r = await leerConReintento('prueba', async () => {
      intentos++;
      return { data: null, error: DE_TRANSPORTE };
    }, [1, 1]);
    expect(r).toEqual({ ok: false });
    // Tres intentos: el primero y los dos de las esperas. Ni uno más.
    expect(intentos).toBe(3);
  });

  it('un error de la base se rinde al PRIMER intento', async () => {
    let intentos = 0;
    const r = await leerConReintento('prueba', async () => {
      intentos++;
      return { data: null, error: DE_LA_BASE };
    }, [1, 1]);
    expect(r).toEqual({ ok: false });
    expect(intentos).toBe(1);
  });

  it('y el log dice QUÉ pasó, no `undefined`', async () => {
    const visto: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { visto.push(args[1]); };
    try {
      await leerConReintento('plan-del-dia', async () => ({ data: null, error: DE_LA_BASE }), []);
    } finally {
      console.error = original;
    }
    expect(visto).toHaveLength(1);
    expect(visto[0]).toMatchObject({ code: '42501', message: 'permission denied', intento: 1 });
  });

  it('y con el objeto vacío lo dice en vez de callar', async () => {
    const visto: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { visto.push(args[1]); };
    try {
      await leerConReintento('cuadro', async () => ({ data: null, error: {} }), []);
    } finally {
      console.error = original;
    }
    expect(visto[0]).toMatchObject({ crudo: 'objeto vacío: el fetch no llegó a salir' });
  });
});
