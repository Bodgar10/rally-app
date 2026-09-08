import { resumenDeFormato } from '../formato-torneo';

describe('el subtítulo de la tarjeta Formato', () => {
  // LO QUE APLICA A TODOS LOS PARTIDOS VA DELANTE. El tercer lugar casi nunca
  // se juega y estaba ocupando la única línea de subtítulo.
  it('empieza por el tercer set', () => {
    expect(resumenDeFormato('super_muerte', 10, false)).toBe('Tercer set: súper muerte a 10');
    expect(resumenDeFormato('set_completo', 10, false)).toBe('Tercer set: set completo');
  });

  it('la súper muerte lleva los puntos configurados', () => {
    expect(resumenDeFormato('super_muerte', 7, false)).toBe('Tercer set: súper muerte a 7');
    expect(resumenDeFormato('super_muerte', 21, false)).toBe('Tercer set: súper muerte a 21');
  });

  // Un set completo se juega a seis juegos: el número de la columna no dice
  // nada de él y meterlo confundiría.
  it('el set completo no lleva puntos', () => {
    expect(resumenDeFormato('set_completo', 15, false)).toBe('Tercer set: set completo');
  });

  it('el tercer lugar va detrás, y solo cuando lo hay', () => {
    expect(resumenDeFormato('super_muerte', 10, true))
      .toBe('Tercer set: súper muerte a 10 · con 3.er lugar');
    expect(resumenDeFormato('set_completo', 10, true))
      .toBe('Tercer set: set completo · con 3.er lugar');
  });

  // "Sin 3.er lugar" era el estado por defecto: decirlo gastaba media línea en
  // confirmar que no pasa nada.
  it('sin tercer lugar no se menciona', () => {
    expect(resumenDeFormato('super_muerte', 10, false)).not.toMatch(/3\.er lugar/);
  });

  // Un torneo recién creado puede no tener las columnas capturadas. Se dice lo
  // que la app aplica, no un hueco.
  it('sin dato, cae a lo normal en padel', () => {
    expect(resumenDeFormato(null, null, false)).toBe('Tercer set: súper muerte a 10');
    expect(resumenDeFormato(undefined, undefined, true))
      .toBe('Tercer set: súper muerte a 10 · con 3.er lugar');
  });

  it('cabe en las dos líneas de la tarjeta', () => {
    for (const t of [true, false]) {
      for (const f of ['super_muerte', 'set_completo'] as const) {
        expect(resumenDeFormato(f, 21, t).length).toBeLessThanOrEqual(48);
      }
    }
  });
});
