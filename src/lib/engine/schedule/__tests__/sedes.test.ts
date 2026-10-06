// Las canchas de un torneo, agrupadas por sede.
//
// EL CASO: Mundo Pádel reparte los grupos entre Narvarte (2 canchas) y Alberca
// Olímpica (3), y juega TODO el cuadro en Alberca — que es la sede del torneo,
// la que sale en el cartel.

import { sedesDelTorneo, canchasDeSede, nombreDeCancha, type CanchaDeTorneo } from '../sedes';

const ALBERCA = 'v-alberca';
const NARVARTE = 'v-narvarte';
const NOMBRES = { [ALBERCA]: 'Alberca Olímpica', [NARVARTE]: 'Narvarte' };

const c = (nombre: string, orden: number, venueId: string | null = null): CanchaDeTorneo =>
  ({ nombre, orden, venueId });

/** El torneo real: 3 en Alberca, 2 en Narvarte. */
const MUNDO = [
  c('Alberca 1', 1, ALBERCA), c('Alberca 2', 2, ALBERCA), c('Alberca 3', 3, ALBERCA),
  c('Narvarte 1', 4, NARVARTE), c('Narvarte 2', 5, NARVARTE),
];

describe('agrupar las canchas por sede', () => {
  it('la sede del torneo va primero: es la que el jugador reconoce', () => {
    const r = sedesDelTorneo(MUNDO, ALBERCA, NOMBRES);
    expect(r.map((s) => s.nombre)).toEqual(['Alberca Olímpica', 'Narvarte']);
    expect(r.map((s) => s.canchas)).toEqual([3, 2]);
  });

  // `tournament_courts.venue_id` es nulable para que un club de una sede no
  // tenga que repetirla en cada cancha.
  it('una cancha sin sede es de la sede del torneo', () => {
    const mezcla = [c('Central', 1), c('Alberca 2', 2, ALBERCA), c('Narvarte 1', 3, NARVARTE)];
    const r = sedesDelTorneo(mezcla, ALBERCA, NOMBRES);
    expect(r.find((s) => s.id === ALBERCA)?.canchas).toBe(2);
  });

  // LA NO-REGRESIÓN QUE IMPORTA: los ids de bloque están guardados en
  // `pair_block_choices`. Devolver un id aquí los prefijaría y dejaría sin
  // valor la elección de cada pareja ya inscrita.
  it('con una sola sede el id es null, como un torneo de siempre', () => {
    const r = sedesDelTorneo([c('Cancha 1', 1), c('Cancha 2', 2)], ALBERCA, NOMBRES);
    expect(r).toEqual([{ id: null, nombre: null, canchas: 2 }]);
  });

  it('y también cuando todas declaran la misma sede', () => {
    const r = sedesDelTorneo([c('Cancha 1', 1, ALBERCA), c('Cancha 2', 2, ALBERCA)], ALBERCA, NOMBRES);
    expect(r).toEqual([{ id: null, nombre: null, canchas: 2 }]);
  });

  it('un torneo sin canchas no tiene sedes', () => {
    expect(sedesDelTorneo([], ALBERCA, NOMBRES)).toEqual([]);
  });

  it('los satélites van por nombre, que es estable entre cargas', () => {
    const tres = [
      ...MUNDO,
      c('Coapa 1', 6, 'v-coapa'),
    ];
    const r = sedesDelTorneo(tres, ALBERCA, { ...NOMBRES, 'v-coapa': 'Coapa' });
    expect(r.map((s) => s.nombre)).toEqual(['Alberca Olímpica', 'Coapa', 'Narvarte']);
  });
});

describe('qué canchas tiene una sede', () => {
  it('las suyas, en orden', () => {
    expect(canchasDeSede(MUNDO, NARVARTE, ALBERCA).map((x) => x.nombre))
      .toEqual(['Narvarte 1', 'Narvarte 2']);
  });

  it('las de la sede del torneo incluyen las que no dicen sede', () => {
    const mezcla = [c('Central', 1), c('Alberca 2', 2, ALBERCA), c('Narvarte 1', 3, NARVARTE)];
    expect(canchasDeSede(mezcla, ALBERCA, ALBERCA).map((x) => x.nombre))
      .toEqual(['Central', 'Alberca 2']);
  });

  // Un torneo de una sede pide sin sede: valen todas.
  it('sin sede valen todas', () => {
    expect(canchasDeSede(MUNDO, null, ALBERCA)).toHaveLength(5);
  });
});

describe('el nombre que lee el jugador', () => {
  // Sin esto el partido dice "Cancha 4" y hay una Cancha 4 en cada sucursal.
  it('traduce el carril del planificador al nombre real', () => {
    expect(nombreDeCancha(MUNDO, NARVARTE, ALBERCA, 1)).toBe('Narvarte 1');
    expect(nombreDeCancha(MUNDO, NARVARTE, ALBERCA, 2)).toBe('Narvarte 2');
    expect(nombreDeCancha(MUNDO, ALBERCA, ALBERCA, 3)).toBe('Alberca 3');
  });

  // Es un fallo de planificación, no una etiqueta que inventar.
  it('null si esa sede no tiene tantas canchas', () => {
    expect(nombreDeCancha(MUNDO, NARVARTE, ALBERCA, 3)).toBeNull();
    expect(nombreDeCancha(MUNDO, NARVARTE, ALBERCA, 0)).toBeNull();
  });
});
