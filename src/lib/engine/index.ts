// src/lib/engine/index.ts
// Superficie pública única de los motores deterministas de RALLY.
// Reexporta todo; sin lógica. Importar siempre desde aquí: '@/lib/engine'.

// Tipos de dominio compartidos
export * from './types';

// Motor de formato (Doc B §1)
export * from './format';

// Rating Glicko-2 (Doc B §6) + bandas de categoría (Doc B §7)
export * from './rating/glicko2';
export * from './rating/category-bands';

// Standings + desempates (Doc B §2)
export * from './standings';

// Clasificación anticipada / clinch (Doc B §3)
export * from './clinch';

// Siembra (Doc B §4)
export * from './seeding';

// Puntos de ranking (Doc B §5)
export * from './ranking-points';

// Validación de marcador (Doc A §4.10)
export * from './score';

// Fixtures round-robin (Doc A §4.7/§4.9)
export * from './fixtures';

// Avance de cuadro eliminatorio (Doc A §4.9)
export * from './bracket';

// Plan de avance al capturar un resultado de eliminatorias
export * from './bracket/avance-captura';

// De qué partidos depende una pareja (motor puro)
export * from './futuro';
