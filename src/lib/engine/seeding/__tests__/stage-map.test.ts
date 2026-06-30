import { stageForBracketSize } from '../stage-map';

describe('stageForBracketSize', () => {
  it('mapea potencias de 2 a los stages reales del enum', () => {
    expect(stageForBracketSize(32)).toBe('round_of_32');
    expect(stageForBracketSize(16)).toBe('round_of_16');
    expect(stageForBracketSize(8)).toBe('quarter');
    expect(stageForBracketSize(4)).toBe('semi');
    expect(stageForBracketSize(2)).toBe('final');
  });
  it('lanza en tamaños no soportados', () => {
    expect(() => stageForBracketSize(6)).toThrow();
    expect(() => stageForBracketSize(0)).toThrow();
  });
});
