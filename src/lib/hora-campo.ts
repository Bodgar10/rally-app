/**
 * RALLY · El campo de hora que no castiga
 *
 * EL PROBLEMA
 *   La pantalla de Horarios pedía la hora en un campo de texto libre y solo
 *   aceptaba `HH:MM` exacto. Escribir "22" —que es lo que teclea cualquiera—
 *   daba "Revisa las horas del sábado: usa el formato 14:00". El organizador no
 *   se equivocó: escribió la hora bien y la app le dijo que no.
 *
 * LA REGLA
 *   Se acepta lo que una persona escribiría, y se normaliza al guardar:
 *
 *     "22"    -> 22:00        "9"     -> 09:00
 *     "2200"  -> 22:00        "930"   -> 09:30
 *     "22:0"  -> 22:00        "9:5"   -> 09:05
 *     "22.30" -> 22:30        "22 30" -> 22:30
 *
 *   Solo se rechaza lo que no es una hora: 25, 9:70, letras, vacío.
 *
 * POR QUÉ DOS FUNCIONES Y NO UNA
 *   `formatearMientrasEscribe` corre en cada tecla y NO puede completar: si
 *   "9" se convirtiera en "09:00" al vuelo, sería imposible escribir "9:30" —
 *   el cursor se iría al final y cada tecla pelearía con el usuario. Lo unico
 *   que hace es meter los dos puntos donde toca.
 *
 *   `normalizarHora` corre al SALIR del campo y al guardar, que es cuando ya
 *   se sabe que la persona terminó de escribir. Ahí sí completa.
 *
 * Logica pura: sin dependencias, misma entrada -> misma salida.
 */

/** Lo que se guarda y lo que el resto del sistema entiende. */
const RE_HORA_COMPLETA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Una hora ya normalizada, en el formato que espera la base. */
export function esHoraValida(v: string): boolean {
  return RE_HORA_COMPLETA.test(v.trim());
}

/**
 * Lo que la persona escribió -> 'HH:MM', o null si no es una hora.
 *
 * Acepta separadores humanos (`:`, `.`, espacio) y horas sin minutos. No
 * inventa: "25" y "9:70" devuelven null, porque no existen.
 */
export function normalizarHora(entrada: string): string | null {
  const limpio = entrada.trim();
  if (limpio === '') return null;

  // Separador explícito: ':', '.' o espacio. "22.3" son las 22:03, no las 22:30
  // — completar a la izquierda es lo que hace un reloj, no a la derecha.
  const conSeparador = /^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/.exec(limpio);
  if (conSeparador) {
    return componer(Number(conSeparador[1]), Number(conSeparador[2]));
  }

  // Solo dígitos: 1-2 son la hora en punto, 3-4 llevan los minutos pegados.
  const soloDigitos = /^(\d{1,4})$/.exec(limpio);
  if (soloDigitos) {
    const d = soloDigitos[1];
    if (d.length <= 2) return componer(Number(d), 0);
    // "930" -> 9:30, "2200" -> 22:00. Los minutos son SIEMPRE los dos últimos.
    return componer(Number(d.slice(0, d.length - 2)), Number(d.slice(-2)));
  }

  return null;
}

function componer(h: number, m: number): string | null {
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Lo que se pinta en el campo MIENTRAS se escribe.
 *
 * Mete los dos puntos solo, tira lo que no sea un dígito y corta a cuatro. No
 * completa nunca: completar al vuelo le pelearía el cursor a quien escribe.
 *
 *   "2"    -> "2"        "22"   -> "22"
 *   "223"  -> "22:3"     "2230" -> "22:30"
 *   "22:"  -> "22"       (borrar los dos puntos borra el dígito de antes)
 */
export function formatearMientrasEscribe(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '').slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

/**
 * Cómo se le enseña una hora a alguien. '09:00' -> '9:00'.
 * El cero a la izquierda es cosa de la base, no de cómo se dice una hora.
 */
export function horaParaLeer(hhmm: string): string {
  return hhmm.replace(/^0/, '');
}
