// La lista de canchas que se está editando.
//
// Con dos sedes esto deja de ser trivial: el orden y los nombres son únicos en
// TODO el torneo, no por sede, y un UNIQUE violado llega desde Postgres sin
// decir cuál de las treinta filas sobra.

import {
  problemasDeCanchas, textoDelProblema, paraGuardar, nombreLibre,
  type CanchaEditada,
} from '@/lib/canchas-editor';

const c = (nombre: string, venueId: string | null = null): CanchaEditada => ({ nombre, venueId });

describe('qué impide guardar', () => {
  it('una lista sana no tiene problemas', () => {
    expect(problemasDeCanchas([c('Narvarte 1', 'n'), c('Alberca 1', 'a')])).toEqual([]);
  });

  it('una cancha sin nombre', () => {
    expect(problemasDeCanchas([c('  ')])[0].motivo).toBe('vacio');
  });

  // El UNIQUE de la base distingue mayúsculas; quien busca en una lista, no.
  it('dos nombres iguales, aunque cambien las mayúsculas', () => {
    const r = problemasDeCanchas([c('Cancha 1'), c('cancha 1')]);
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe('repetido');
  });

  it('un nombre más largo de lo que acepta la base', () => {
    expect(problemasDeCanchas([c('x'.repeat(41))])[0].motivo).toBe('largo');
  });

  it('el mensaje dice cuál es y qué pasa', () => {
    expect(textoDelProblema({ nombre: 'Cancha 1', motivo: 'repetido' })).toContain('Cancha 1');
    expect(textoDelProblema({ nombre: '', motivo: 'vacio' })).toMatch(/sin nombre/i);
  });
});

describe('cómo se guardan', () => {
  // El orden es del TORNEO: el planificador recorre una sucursal entera antes
  // de pasar a la siguiente, que es como se juega de verdad.
  it('el orden sale de la posición, atravesando las sedes', () => {
    const r = paraGuardar([c('Alberca 1', 'a'), c('Alberca 2', 'a'), c('Narvarte 1', 'n')]);
    expect(r.map((x) => x.orden)).toEqual([1, 2, 3]);
    expect(r.map((x) => x.venue_id)).toEqual(['a', 'a', 'n']);
  });

  it('los nombres se guardan sin espacios de sobra', () => {
    expect(paraGuardar([c('  Cancha 1  ')])[0].nombre).toBe('Cancha 1');
  });
});

describe('el nombre que se propone al añadir', () => {
  it('lleva el de la sede cuando la hay', () => {
    expect(nombreLibre([], 'Narvarte')).toBe('Narvarte 1');
  });

  it('y "Cancha" cuando no', () => {
    expect(nombreLibre([], null)).toBe('Cancha 1');
  });

  // Añadir dos veces seguidas no puede producir dos canchas iguales y un error
  // al guardar.
  it('salta los que ya están', () => {
    expect(nombreLibre([c('Narvarte 1', 'n'), c('Narvarte 2', 'n')], 'Narvarte'))
      .toBe('Narvarte 3');
  });

  it('y no se deja engañar por las mayúsculas', () => {
    expect(nombreLibre([c('narvarte 1')], 'Narvarte')).toBe('Narvarte 2');
  });
});
