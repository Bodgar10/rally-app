// src/components/expres/index.ts
// La UI del torneo exprés. Carpeta propia, como el motor: ningún componente de
// torneo largo importa de aquí y ninguno de aquí importa de allí.
//
// Los tres son PRESENTACIONALES a propósito: reciben datos por props y
// devuelven la decisión por callback. No hablan con Supabase. Así se pueden
// montar antes de que existan las tablas nuevas en la base, y la pantalla que
// los use decide de dónde saca los datos.

export { default as ScoreCaptureExpres } from './ScoreCaptureExpres';
export type { ScoreCaptureExpresProps } from './ScoreCaptureExpres';

export { default as TablaExpresGrupo } from './TablaExpresGrupo';
export type { TablaExpresGrupoProps } from './TablaExpresGrupo';

export { default as DecisionDeEmpate } from './DecisionDeEmpate';
export type { DecisionDeEmpateProps } from './DecisionDeEmpate';

export { default as SelectorDeModo } from './SelectorDeModo';
export type { SelectorDeModoProps, ModoTorneo } from './SelectorDeModo';

export { default as CrearExpres } from './CrearExpres';
export type { CrearExpresProps, ConfigExpres, FinalFormato } from './CrearExpres';
