import { esFalloDeRed, mensajeDeFallo, fallo, registrarFallo } from '../errores-red';

const GENERICO = 'No se pudo completar la operación.';

describe('esFalloDeRed', () => {
  it('reconoce el fetch que no llega, en las tres plataformas', () => {
    expect(esFalloDeRed(new TypeError('Failed to fetch'))).toBe(true);          // navegador
    expect(esFalloDeRed(new TypeError('Network request failed'))).toBe(true);   // React Native
    expect(esFalloDeRed(new TypeError('Load failed'))).toBe(true);              // Safari
    expect(esFalloDeRed(new Error('fetch failed'))).toBe(true);                 // undici / node
  });

  it('NO llama red a lo que pasó después de tener respuesta', () => {
    // Estos son los que se disfrazaban de "revisa tu internet".
    expect(esFalloDeRed(new SyntaxError('Unexpected end of JSON input'))).toBe(false);
    expect(esFalloDeRed(new TypeError("Cannot read properties of null (reading 'ok')"))).toBe(false);
    expect(esFalloDeRed(new Error('Sin sesión activa.'))).toBe(false);
  });

  it('una cancelación nuestra no es un problema de la red', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(esFalloDeRed(abort)).toBe(false);
  });

  it('aguanta basura', () => {
    expect(esFalloDeRed(null)).toBe(false);
    expect(esFalloDeRed(undefined)).toBe(false);
    expect(esFalloDeRed({})).toBe(false);
    expect(esFalloDeRed(42)).toBe(false);
    expect(esFalloDeRed('Network request failed')).toBe(true);
  });
});

describe('mensajeDeFallo', () => {
  it('solo dice "revisa tu internet" cuando de verdad fue la red', () => {
    expect(mensajeDeFallo(new TypeError('Network request failed'), GENERICO)).toMatch(/internet/i);
  });

  it('no culpa a la conexión de un error nuestro', () => {
    const m = mensajeDeFallo(new SyntaxError('Unexpected end of JSON input'), GENERICO);
    expect(m).toBe(GENERICO);
    expect(m).not.toMatch(/internet/i);
  });
});

describe('registrarFallo / fallo', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => { spy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { spy.mockRestore(); });

  it('el error nunca se pierde: se registra con su contexto', () => {
    registrarFallo('inscripcion', new Error('boom'), { tournamentId: 't1' });
    expect(spy).toHaveBeenCalledTimes(1);
    const [etiqueta, cuerpo] = spy.mock.calls[0];
    expect(etiqueta).toBe('[inscripcion]');
    expect(cuerpo).toMatchObject({ mensaje: 'boom', nombre: 'Error', esRed: false, tournamentId: 't1' });
  });

  it('`fallo` registra y devuelve la frase de una vez', () => {
    const m = fallo('venue-picker', new TypeError('Failed to fetch'), GENERICO);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(m).toMatch(/internet/i);
  });

  it('marca en el log si fue red o no, que es el dato que faltaba', () => {
    fallo('x', new SyntaxError('Unexpected end of JSON input'), GENERICO);
    expect(spy.mock.calls[0][1]).toMatchObject({ esRed: false });
  });
});
