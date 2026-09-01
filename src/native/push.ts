/**
 * RALLY · Notificaciones al jugador — ESQUELETO
 *
 * LO QUE ESTO ES Y LO QUE NO
 *   NO envía nada. Push no está configurado —no hay `expo-notifications`, ni
 *   credenciales de APNs/FCM, ni tabla de tokens— y configurarlo no es de este
 *   turno. Lo que hay aquí son los CUATRO MOMENTOS en que el jugador tiene que
 *   enterarse, con sus textos ya escritos y un disparador que por ahora solo
 *   escribe en consola.
 *
 * POR QUÉ EXISTE ANTES QUE EL PUSH
 *   Porque el trabajo difícil de una notificación no es mandarla, es decidir
 *   CUÁNDO y QUÉ DICE. Esas dos cosas se pueden fijar hoy, revisar en la
 *   consola con el torneo de prueba, y no tocarlas cuando llegue el transporte.
 *   Al revés —montar push primero y luego pensar los mensajes— es como se
 *   acaban mandando cuatro notificaciones seguidas a las once de la noche.
 *
 * CUANDO SE ENCHUFE EL TRANSPORTE
 *   Solo cambia `entregar`. Los cuatro `notificar*` de abajo, sus textos y sus
 *   puntos de llamada se quedan como están. Ese es todo el motivo de que el
 *   transporte esté detrás de una función de una línea.
 *
 *   Falta, y se sabe: permiso del usuario, registro del token por dispositivo,
 *   preferencias por tipo (habrá quien no quiera la de "tu cancha se libera"),
 *   y una hora de silencio. Ninguna de esas decisiones se toma bien sin los
 *   mensajes delante, que es lo que este archivo pone sobre la mesa.
 */

/** Los cuatro momentos. Nombrados por lo que le pasa al jugador, no por la tabla. */
export type MomentoDeAviso =
  | 'resultado_capturado'
  | 'pasaste_de_fase'
  | 'ya_hay_horario'
  | 'cancha_por_liberarse';

export interface Aviso {
  momento: MomentoDeAviso;
  titulo: string;
  cuerpo: string;
  /** A dónde lleva al tocarla. Ruta de expo-router. */
  destino?: string;
}

/**
 * EL ÚNICO SITIO QUE CAMBIA CUANDO HAYA PUSH DE VERDAD.
 *
 * Hoy: consola. Mañana: `expo-notifications` en nativo y el service worker en
 * web, o una Edge Function si el aviso tiene que salir con la app cerrada — que
 * es el caso de tres de los cuatro.
 */
async function entregar(aviso: Aviso): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[push:stub] ${aviso.momento}\n  ${aviso.titulo}\n  ${aviso.cuerpo}` +
    (aviso.destino ? `\n  → ${aviso.destino}` : ''),
  );
}

/**
 * Se capturó tu resultado.
 *
 * Llega cuando el juez guarda el marcador. Importa porque el jugador se va de
 * la cancha sin saber si quedó registrado, y volver a preguntar es justo lo que
 * la app viene a evitar. Lleva el marcador dentro para que no haya que abrirla.
 */
export function notificarResultadoCapturado(args: {
  marcador: string;
  ganaste: boolean;
  tournamentId: string;
  categoryId: string;
}): Promise<void> {
  return entregar({
    momento: 'resultado_capturado',
    titulo: args.ganaste ? 'Ganaste tu partido' : 'Resultado registrado',
    cuerpo: `Quedó ${args.marcador}. Ya está en la tabla de tu grupo.`,
    destino: `/(protected)/torneos/${args.tournamentId}/${args.categoryId}`,
  });
}

/**
 * Pasaste de fase.
 *
 * El aviso que la gente espera de pie junto al marcador de papel. Se dispara
 * cuando `clinch_status` pasa a `clinched`, o cuando aparece su cruce en el
 * cuadro.
 */
export function notificarPasasteDeFase(args: {
  ronda: string;
  tournamentId: string;
  categoryId: string;
}): Promise<void> {
  return entregar({
    momento: 'pasaste_de_fase',
    titulo: 'Estás dentro',
    cuerpo: `Clasificaste a ${args.ronda}. Entra para ver contra quién juegas.`,
    destino: `/(protected)/torneos/${args.tournamentId}/${args.categoryId}`,
  });
}

/**
 * Ya se sabe tu horario.
 *
 * ESTE ES EL DE LA NOCHE DEL SÁBADO. Es la diferencia entre poner el
 * despertador a las siete por si acaso y dormir hasta las nueve sabiendo que
 * juegas a las once. Lleva hora y cancha en el cuerpo a propósito: tiene que
 * poderse leer desde la pantalla de bloqueo, sin abrir nada.
 */
export function notificarYaHayHorario(args: {
  hora: string;
  cancha: string | null;
  tournamentId: string;
  categoryId: string;
}): Promise<void> {
  return entregar({
    momento: 'ya_hay_horario',
    titulo: 'Ya tienes hora',
    cuerpo: args.cancha
      ? `Juegas a las ${args.hora} en ${args.cancha}.`
      : `Juegas a las ${args.hora}.`,
    destino: `/(protected)/torneos/${args.tournamentId}/${args.categoryId}`,
  });
}

/**
 * Tu cancha está por liberarse.
 *
 * El aviso de "ve saliendo". En un torneo real los partidos se corren y la hora
 * publicada deja de valer a media mañana; esto es lo que sustituye al altavoz.
 *
 * `minutos` es una estimación, y el texto lo dice: prometer una hora exacta
 * sobre un partido que sigue en juego es una promesa que no se puede cumplir.
 */
export function notificarCanchaPorLiberarse(args: {
  cancha: string;
  minutos: number;
}): Promise<void> {
  return entregar({
    momento: 'cancha_por_liberarse',
    titulo: 'Ve preparándote',
    cuerpo: `${args.cancha} se libera en unos ${args.minutos} minutos. Es la tuya.`,
  });
}
