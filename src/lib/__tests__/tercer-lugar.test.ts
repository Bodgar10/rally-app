import {
  categoriasConTercerLugar, minutosQueAnade, frasePrecioTercerLugar,
} from '../tercer-lugar';

describe('categoriasConTercerLugar', () => {
  it('hacen falta dos perdedores de semifinal', () => {
    // Con 3 clasificados una semifinal es bye: solo pierde una pareja.
    expect(categoriasConTercerLugar([3])).toBe(0);
    expect(categoriasConTercerLugar([2])).toBe(0);
    expect(categoriasConTercerLugar([4])).toBe(1);
  });

  it('Cimepa: siete de las ocho categorías en el piso', () => {
    // Clasificados del piso: 7,10,10,10,5,4,6,3. La de 3 se queda fuera.
    expect(categoriasConTercerLugar([7, 10, 10, 10, 5, 4, 6, 3])).toBe(7);
  });
});

describe('minutosQueAnade', () => {
  it('caen todos en la misma oleada, no en fila', () => {
    // 8 partidos en 8 canchas es UNA tanda: una hora, no ocho.
    expect(minutosQueAnade(8, 8, 60)).toBe(60);
    expect(minutosQueAnade(7, 8, 60)).toBe(60);
  });

  it('con menos canchas que categorías hacen falta más tandas', () => {
    expect(minutosQueAnade(8, 4, 60)).toBe(120);
    expect(minutosQueAnade(8, 3, 60)).toBe(180);
  });

  it('aguanta los bordes sin dividir por cero', () => {
    expect(minutosQueAnade(0, 8, 60)).toBe(0);
    expect(minutosQueAnade(8, 0, 60)).toBe(0);
  });
});

describe('frasePrecioTercerLugar', () => {
  it('dice partidos Y tiempo, que son las dos mitades del precio', () => {
    const f = frasePrecioTercerLugar([8, 8, 8, 8, 8, 8, 8, 8], 8, 60);
    expect(f).toMatch(/8 partidos/);
    expect(f).toMatch(/1 hora/);
  });

  it('no promete partidos que no se van a jugar', () => {
    expect(frasePrecioTercerLugar([3, 2], 8, 60)).toMatch(/no añade partidos/);
  });

  it('singular cuando es uno solo', () => {
    const f = frasePrecioTercerLugar([4], 8, 60);
    expect(f).toMatch(/1 partido\b/);
    expect(f).not.toMatch(/1 partidos/);
  });

  it('dice minutos cuando no es una hora redonda', () => {
    expect(frasePrecioTercerLugar([4], 8, 45)).toMatch(/45 min/);
  });
});
