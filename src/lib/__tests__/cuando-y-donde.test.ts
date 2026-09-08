import { cuandoYDonde } from '@/lib/juez/cuando-y-donde';

// LA ESCENA: un jugador pregunta en qué cancha le toca. El juez filtra,
// encuentra el nombre, y la tarjeta le decía la hora y nada más.
describe('cuándo y dónde, en la tarjeta del juez', () => {
  it('la hora y la cancha, que es lo que le preguntan', () => {
    expect(cuandoYDonde({ hora: '14:00', diaYHora: '', cancha: 'Cancha 3' }))
      .toBe('14:00 · Cancha 3');
  });

  // Un hueco no se distingue de "no lo miré".
  it('sin cancha asignada se dice, no se deja en blanco', () => {
    expect(cuandoYDonde({ hora: '14:00', diaYHora: '', cancha: null }))
      .toBe('14:00 · Sin cancha');
  });

  it('sin hora, con cancha', () => {
    expect(cuandoYDonde({ hora: '', diaYHora: '', cancha: 'Cancha 1' }))
      .toBe('Sin hora · Cancha 1');
  });

  // Las dos ausencias son un solo hecho: ese partido no está programado.
  it('sin nada, un solo aviso', () => {
    expect(cuandoYDonde({ hora: '', diaYHora: '', cancha: null }))
      .toBe('Sin hora ni cancha');
  });

  // EL SEGUNDO HUECO: la lista pintaba "14:00" a secas en un torneo de tres
  // días, así que el domingo se leía igual que hoy.
  it('el día se dice cuando el partido no es de hoy', () => {
    expect(cuandoYDonde({ hora: '14:00', diaYHora: 'dom 6, 14:00', cancha: 'Cancha 2' }))
      .toBe('dom 6, 14:00 · Cancha 2');
  });

  it('y no se dice cuando sí es de hoy', () => {
    expect(cuandoYDonde({ hora: '09:30', diaYHora: '', cancha: 'Cancha 2' }))
      .not.toMatch(/dom|lun|mar|mié|jue|vie|sáb/);
  });

  // Una cancha en blanco en la base vale lo mismo que null.
  it('una cancha vacía cuenta como sin asignar', () => {
    expect(cuandoYDonde({ hora: '14:00', diaYHora: '', cancha: '   ' }))
      .toBe('14:00 · Sin cancha');
  });

  it('cabe en la línea de una tarjeta', () => {
    const largo = cuandoYDonde({ hora: '14:00', diaYHora: 'dom 6, 14:00', cancha: 'Cancha 12' });
    expect(largo.length).toBeLessThanOrEqual(32);
  });
});

// El fallo que ya nos pasó en el cuadro: el campo en el tipo, pintándose, y la
// consulta sin pedirlo. Se fija aquí porque no lo cubre nada más.
describe('la consulta del juez trae la cancha', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', '..', 'app', '(judge)', 'juez', '[tournamentId].tsx'),
    'utf8',
  ) as string;

  it('court_label está en el select', () => {
    const select = src.slice(src.indexOf('.select('), src.indexOf('.eq(\'tournament_id\''));
    expect(select).toContain('court_label');
  });

  it('y llega hasta la tarjeta', () => {
    expect(src).toMatch(/courtLabel: row\.court_label/);
    expect(src).toMatch(/cancha: item\.courtLabel/);
  });
});
