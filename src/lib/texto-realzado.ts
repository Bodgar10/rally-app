/**
 * RALLY · Resaltar lo que importa dentro de un párrafo.
 *
 * ► EL PROBLEMA QUE RESUELVE
 *   Los párrafos de la portada eran bloques grises uniformes de cuatro
 *   renglones. Todo al mismo peso es lo mismo que nada al mismo peso: el ojo
 *   no encuentra dónde agarrarse, así que o lo lee entero o no lo lee — y en
 *   una portada no lo lee entero.
 *
 *   Lo que funciona es lo contrario: la mayoría del párrafo en gris tenue y
 *   dos o tres fragmentos en claro. Quien pasa de largo se lleva solo los
 *   fragmentos claros, y tienen que significar algo por sí solos; quien se
 *   para, lee la frase completa y el resto da el contexto.
 *
 * ► LA MARCA ES `*así*`
 *   Se eligió el asterisco porque se escribe sin salir del teclado y porque
 *   quien edite el texto no necesita saber nada de React: el copy se lee y se
 *   corrige en una línea de string, no repartido en cinco componentes `<Text>`
 *   anidados que nadie se atreve a tocar.
 *
 * ► UN ASTERISCO SUELTO NO ROMPE NADA
 *   Si alguien abre un realce y no lo cierra, el resto del párrafo sale en
 *   claro y ya. Una portada que revienta —o que se queda en blanco— por una
 *   errata de copy sería un precio absurdo por un subrayado.
 *
 * Módulo puro: se prueba sin pantalla.
 */

export interface TrozoDeTexto {
  texto: string;
  /** Va en claro y con más peso. Fuera de eso, gris tenue. */
  fuerte: boolean;
}

/**
 * Parte un texto por sus realces.
 *
 *   'Pasan *4 de cada grupo* a cuartos.'
 *     → [{ 'Pasan ', false }, { '4 de cada grupo', true }, { ' a cuartos.', false }]
 *
 * Los trozos vacíos se descartan: no aportan nada y obligarían a cada pantalla
 * a filtrarlos antes de pintar.
 */
export function partirRealzado(texto: string): TrozoDeTexto[] {
  if (!texto) return [];

  const trozos: TrozoDeTexto[] = [];
  // Índices pares fuera del realce, impares dentro: es lo que hace `split`
  // con un separador simple, y así no hace falta ninguna máquina de estados.
  texto.split('*').forEach((parte, i) => {
    if (parte.length === 0) return;
    trozos.push({ texto: parte, fuerte: i % 2 === 1 });
  });

  return trozos;
}

/** El texto sin marcas. Para etiquetas de accesibilidad y para medir. */
export function textoPlano(texto: string): string {
  return texto.replace(/\*/g, '');
}
