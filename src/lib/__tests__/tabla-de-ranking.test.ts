import { conCortes, textoDelSalto, type FilaDeRanking } from '@/lib/tabla-de-ranking';

const f = (position: number, is_me = false): FilaDeRanking =>
  ({ player_id: `p${position}`, position, is_me });

describe('conCortes', () => {
  it('sin huecos, ningún corte', () => {
    expect(conCortes([f(1), f(2), f(3)]).map((x) => x.saltoAntes)).toEqual([0, 0, 0]);
  });

  // El caso real: top 50 y tu fila colgada al final con la 340.
  it('marca el salto entre el final del top y la fila propia', () => {
    const t = conCortes([f(49), f(50), f(340, true)]);
    expect(t.map((x) => x.saltoAntes)).toEqual([0, 0, 289]);
  });

  it('la primera fila nunca lleva salto, aunque no empiece en 1', () => {
    expect(conCortes([f(50), f(51)])[0].saltoAntes).toBe(0);
  });

  // Justo después del corte: no hay hueco que anunciar.
  it('el jugador 51 va pegado al 50 sin corte', () => {
    expect(conCortes([f(50), f(51, true)])[1].saltoAntes).toBe(0);
  });

  it('si el jugador SÍ está en el top, no hay salto en ningún lado', () => {
    const t = conCortes([f(1), f(2), f(3, true), f(4)]);
    expect(t.every((x) => x.saltoAntes === 0)).toBe(true);
  });

  // Posiciones repetidas o desordenadas no pueden inventar un salto negativo.
  it('posiciones empatadas no producen salto', () => {
    expect(conCortes([f(7), f(7)])[1].saltoAntes).toBe(0);
  });

  it('una lista desordenada no inventa un salto al revés', () => {
    expect(conCortes([f(10), f(4)])[1].saltoAntes).toBe(0);
  });

  it('conserva las filas y su orden, sin tocarlas', () => {
    const entrada = [f(1), f(2), f(99, true)];
    const salida = conCortes(entrada);
    expect(salida.map((x) => x.fila)).toEqual(entrada);
  });

  it('una lista vacía no revienta', () => {
    expect(conCortes([])).toEqual([]);
  });

  it('con una sola fila tampoco', () => {
    expect(conCortes([f(340, true)])).toEqual([{ fila: f(340, true), saltoAntes: 0 }]);
  });
});

describe('textoDelSalto', () => {
  it('sin salto devuelve null: la pantalla no vuelve a comprobarlo', () => {
    expect(textoDelSalto(0)).toBeNull();
    expect(textoDelSalto(-3)).toBeNull();
  });

  it('uno va en singular', () => {
    expect(textoDelSalto(1)).toBe('1 jugador más');
  });

  it('lleva separador de miles: 1289 se lee de un golpe', () => {
    expect(textoDelSalto(1289)).toBe('1,289 jugadores más');
  });

  it('el caso normal', () => {
    expect(textoDelSalto(289)).toBe('289 jugadores más');
  });
});
