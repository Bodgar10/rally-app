import { categoriasListasParaCuadro, faltanParaCuadro } from '../cuadro-listo';

const g = (categoryId: string, status: string) => ({ categoryId, stage: 'group', status });
const ko = (categoryId: string) => ({ categoryId, stage: 'quarter', status: 'scheduled' });

describe('categoriasListasParaCuadro', () => {
  it('una categoría con todos sus grupos jugados y sin cuadro está lista', () => {
    expect(categoriasListasParaCuadro([g('5a', 'finished'), g('5a', 'finished')]))
      .toEqual([{ id: '5a', partidosDeGrupo: 2 }]);
  });

  it('con un partido sin terminar no está lista', () => {
    expect(categoriasListasParaCuadro([g('5a', 'finished'), g('5a', 'scheduled')])).toEqual([]);
  });

  it('si ya tiene cuadro no se vuelve a ofrecer', () => {
    expect(categoriasListasParaCuadro([g('5a', 'finished'), ko('5a')])).toEqual([]);
  });

  it('una categoría sin partidos de grupo no aparece', () => {
    expect(categoriasListasParaCuadro([ko('5a')])).toEqual([]);
  });

  it('separa una categoría de otra', () => {
    const r = categoriasListasParaCuadro([
      g('5a', 'finished'), g('5a', 'finished'),
      g('6a', 'finished'), g('6a', 'in_progress'),
    ]);
    expect(r).toEqual([{ id: '5a', partidosDeGrupo: 2 }]);
  });

  it('el orden no baila entre recargas', () => {
    const uno = categoriasListasParaCuadro([g('b', 'finished'), g('a', 'finished')]);
    const otro = categoriasListasParaCuadro([g('a', 'finished'), g('b', 'finished')]);
    expect(uno).toEqual(otro);
  });
});

describe('faltanParaCuadro', () => {
  it('cuenta los que faltan', () => {
    expect(faltanParaCuadro([g('5a', 'finished'), g('5a', 'scheduled'), g('5a', 'scheduled')], '5a')).toBe(2);
  });
  it('null cuando ya se puede', () => {
    expect(faltanParaCuadro([g('5a', 'finished')], '5a')).toBeNull();
  });
  it('null cuando la categoría no tiene grupos', () => {
    expect(faltanParaCuadro([ko('5a')], '5a')).toBeNull();
  });
});
