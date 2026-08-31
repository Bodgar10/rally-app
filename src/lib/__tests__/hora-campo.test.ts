/**
 * El campo de hora tiene una sola regla: que el organizador nunca vea un error
 * por escribir "22". Estos tests son esa regla.
 */

import {
  normalizarHora, formatearMientrasEscribe, esHoraValida, horaParaLeer,
} from '@/lib/hora-campo';

describe('normalizarHora', () => {
  it('la hora sola se completa en punto', () => {
    expect(normalizarHora('22')).toBe('22:00');
    expect(normalizarHora('9')).toBe('09:00');
    expect(normalizarHora('0')).toBe('00:00');
    expect(normalizarHora('23')).toBe('23:00');
  });

  it('los digitos pegados se parten por los minutos', () => {
    expect(normalizarHora('2200')).toBe('22:00');
    expect(normalizarHora('930')).toBe('09:30');
    expect(normalizarHora('0930')).toBe('09:30');
    expect(normalizarHora('2345')).toBe('23:45');
  });

  it('acepta los separadores que una persona escribe', () => {
    expect(normalizarHora('22:30')).toBe('22:30');
    expect(normalizarHora('22.30')).toBe('22:30');
    expect(normalizarHora('22 30')).toBe('22:30');
    expect(normalizarHora(' 22:30 ')).toBe('22:30');
  });

  it('los minutos a medias se completan por la IZQUIERDA, como un reloj', () => {
    // "9:5" son las nueve y cinco, no las nueve y cincuenta.
    expect(normalizarHora('9:5')).toBe('09:05');
    expect(normalizarHora('22:0')).toBe('22:00');
  });

  it('rechaza lo que no es una hora, sin inventar', () => {
    for (const malo of ['', '  ', '25', '24', '9:70', '99:99', 'ocho', '8pm', '1:2:3', '12345']) {
      expect(normalizarHora(malo)).toBeNull();
    }
  });

  it('lo que devuelve SIEMPRE es una hora que el resto del sistema entiende', () => {
    for (const bueno of ['22', '9', '930', '2200', '22.30', '0']) {
      const v = normalizarHora(bueno)!;
      expect(v).not.toBeNull();
      expect(esHoraValida(v)).toBe(true);
    }
  });

  it('es idempotente: normalizar lo ya normalizado no lo mueve', () => {
    for (const v of ['00:00', '09:30', '22:00', '23:59']) {
      expect(normalizarHora(v)).toBe(v);
    }
  });
});

describe('formatearMientrasEscribe', () => {
  it('mete los dos puntos solo, en cuanto hacen falta', () => {
    expect(formatearMientrasEscribe('2')).toBe('2');
    expect(formatearMientrasEscribe('22')).toBe('22');
    expect(formatearMientrasEscribe('223')).toBe('22:3');
    expect(formatearMientrasEscribe('2230')).toBe('22:30');
  });

  it('NO completa: escribir "9" y seguir con ":30" tiene que ser posible', () => {
    // Si "9" se convirtiera en "09:00" al vuelo, el cursor saltaria al final y
    // cada tecla pelearia con quien escribe.
    expect(formatearMientrasEscribe('9')).toBe('9');
    expect(formatearMientrasEscribe('93')).toBe('93');
    expect(formatearMientrasEscribe('930')).toBe('93:0');
  });

  it('tira lo que no es un digito y no se pasa de cuatro', () => {
    expect(formatearMientrasEscribe('22:30')).toBe('22:30');
    expect(formatearMientrasEscribe('2a2b')).toBe('22');
    expect(formatearMientrasEscribe('22303030')).toBe('22:30');
    expect(formatearMientrasEscribe('')).toBe('');
  });

  it('borrar hacia atras funciona: quitar los dos puntos quita el digito', () => {
    // El usuario ve "22:3", pulsa borrar dos veces y espera quedarse en "22".
    expect(formatearMientrasEscribe('22:')).toBe('22');
    expect(formatearMientrasEscribe('2')).toBe('2');
  });
});

describe('horaParaLeer', () => {
  it('quita el cero de la izquierda', () => {
    expect(horaParaLeer('09:30')).toBe('9:30');
    expect(horaParaLeer('22:00')).toBe('22:00');
    expect(horaParaLeer('00:15')).toBe('0:15');
  });
});
