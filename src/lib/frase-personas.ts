/**
 * RALLY · Nombrar a las personas de un aviso
 *
 * EL AVISO QUE NO SERVÍA
 *   El calendario decía "2ª y 3ª comparten jugadores y su Semi y Cuartos
 *   coinciden a las 17:00". Saber que hay un choque sin saber CON QUIÉN no
 *   sirve para resolverlo: lo que el organizador va a hacer con ese aviso es
 *   escribirle a alguien, y para eso necesita el nombre.
 *
 * POR QUÉ SE CORTA EN DOS
 *   Un aviso con seis nombres dentro deja de leerse de un vistazo, que es lo
 *   único que un aviso tiene que conseguir. Se nombran dos y se cuenta el
 *   resto; la lista completa va debajo, para copiarla.
 */

/**
 * 'comparten jugadores'                                    (sin nombres)
 * 'comparten a Ana Ruiz'
 * 'comparten a Ana Ruiz y Marta Gil'
 * 'comparten a Ana Ruiz, Marta Gil y 4 jugadores más'
 */
export function frasePersonas(nombres: string[]): string {
  const limpios = nombres.filter((n) => !!n && n.trim() !== '');
  if (limpios.length === 0) return 'comparten jugadores';
  if (limpios.length === 1) return `comparten a ${limpios[0]}`;
  if (limpios.length === 2) return `comparten a ${limpios[0]} y ${limpios[1]}`;
  const resto = limpios.length - 2;
  return `comparten a ${limpios[0]}, ${limpios[1]} y ${resto} ${resto === 1 ? 'jugador más' : 'jugadores más'}`;
}
