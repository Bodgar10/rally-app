/**
 * RALLY · useDebounce
 *
 * Devuelve `valor` con retraso: solo se actualiza cuando pasan `ms` sin que
 * cambie. Para búsquedas que consultan el servidor a cada tecla.
 *
 * Sin esto, escribir "ernesto" dispara 7 llamadas a search_users y las
 * respuestas pueden llegar desordenadas, dejando en pantalla los resultados
 * de "ernes" después de los de "ernesto".
 */

import { useEffect, useState } from 'react';

export function useDebounce<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return retrasado;
}
