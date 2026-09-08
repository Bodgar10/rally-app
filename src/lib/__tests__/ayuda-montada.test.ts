/**
 * RALLY · Que el botón de ayuda siga estando
 *
 * EL FALLO QUE LO MOTIVA
 *   La interrogación desapareció del panel del organizador y nadie se enteró
 *   hasta que alguien miró. La causa: la ayuda vive en el layout de
 *   `(organizer)` y sacaba el id del torneo de `useLocalSearchParams`, que en
 *   un LAYOUT no ve el `[tournamentId]` de sus hijos. Cargando la URL a pelo
 *   colaba; entrando desde "Mis torneos" llegaba vacío, el componente se daba
 *   por fuera de un torneo y devolvía `null`.
 *
 *   Lo peor no fue el fallo: fue que estuvo desde el primer commit y todas las
 *   verificaciones lo taparon, porque todas entraban por URL directa.
 *
 * QUÉ FIJA ESTE ARCHIVO
 *   Un elemento que vive en un layout no lo cubre ninguna prueba de pantalla:
 *   no es de nadie. Aquí se fijan las tres cosas que tienen que ser ciertas
 *   para que aparezca, y las tres se pueden comprobar sin montar React:
 *
 *     1. Los dos layouts lo PINTAN. Borrarlo de uno —el de web es un gemelo
 *        que se olvida— rompería la mitad de las plataformas en silencio.
 *     2. La ruta de CADA pantalla del panel resuelve un id de torneo. Es la
 *        condición que el componente usa para decidir si se pinta.
 *     3. Y NO se vuelve a leer de los params, que es el error exacto.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { torneoDeRuta, pantallaDeRuta } from '../ayuda-organizador';

const RAIZ = join(__dirname, '..', '..', '..');
const ORG = join(RAIZ, 'app', '(organizer)');
const AYUDA = join(RAIZ, 'src', 'components', 'organizer', 'AyudaOrganizador.tsx');

const leer = (...p: string[]) => readFileSync(join(...p), 'utf8');

describe('el botón de ayuda se monta en (organizer)', () => {
  // Nativo y web son gemelos: el de web se olvida, porque el que se edita a
  // diario es el otro.
  it.each(['_layout.tsx', '_layout.web.tsx'])('%s lo pinta', (archivo) => {
    const src = leer(ORG, archivo);
    expect(src).toMatch(/<AyudaOrganizador\s*\/>/);
    expect(src).toMatch(/import AyudaOrganizador\s+from '@\/components\/organizer\/AyudaOrganizador'/);
  });

  // La barra de guía viaja con la ayuda y se rompería igual de callada.
  it.each(['_layout.tsx', '_layout.web.tsx'])('%s también pinta la barra de guía', (archivo) => {
    expect(leer(ORG, archivo)).toMatch(/<BarraDeGuia\s*\/>/);
  });
});

describe('toda pantalla del panel resuelve su torneo', () => {
  /** Los apartados reales, leídos del disco y no de una lista a mano. */
  const apartados = readdirSync(join(ORG, 'org', 'torneos', '[tournamentId]'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => f.replace(/\.tsx$/, ''))
    .filter((f) => f !== 'index');

  it('hay apartados que comprobar', () => {
    expect(apartados.length).toBeGreaterThan(10);
  });

  it('el panel', () => {
    expect(torneoDeRuta('/org/torneos/abc')).toBe('abc');
    expect(torneoDeRuta('/(organizer)/org/torneos/abc')).toBe('abc');
    expect(pantallaDeRuta('/org/torneos/abc')).toBe('panel');
  });

  it.each(apartados)('/%s', (apartado) => {
    const ruta = `/org/torneos/abc/${apartado}`;
    // La condición exacta que decide si el botón se pinta.
    expect(torneoDeRuta(ruta)).toBe('abc');
  });

  // Fuera de un torneo la ayuda se calla a propósito: sus preguntas hablan de
  // "este torneo" y los enlaces no tendrían a dónde ir.
  it.each([
    ['/org', 'la home del organizador'],
    ['/org/torneos', 'una lista sin id'],
    ['/(protected)/dashboard', 'el dashboard del jugador'],
    ['/', 'la raíz'],
  ])('%s no resuelve torneo (%s)', (ruta) => {
    expect(torneoDeRuta(ruta)).toBeNull();
  });

  it('un uuid de verdad, con guiones', () => {
    const id = 'bb8e137e-9c7a-408f-8730-c52309e6cde6';
    expect(torneoDeRuta(`/org/torneos/${id}/horarios`)).toBe(id);
  });

  it('la query no estorba', () => {
    expect(torneoDeRuta('/org/torneos/abc/jueces?foo=1')).toBe('abc');
  });
});

describe('y no se vuelve a leer de los params', () => {
  // EL ERROR EXACTO, fijado por su nombre. Un layout no ve el segmento
  // dinámico de sus hijos, así que `useLocalSearchParams` aquí devuelve `{}`
  // en cuanto se entra navegando en vez de por URL.
  it('AyudaOrganizador no usa useLocalSearchParams', () => {
    expect(leer(AYUDA)).not.toMatch(/useLocalSearchParams/);
  });

  it('y saca el id de la ruta', () => {
    expect(leer(AYUDA)).toMatch(/torneoDeRuta\(pathname\)/);
  });
});
