// _shared/email.ts — envío de correo transaccional por Resend.
//
// PRIMER CONSUMIDOR DE RESEND EN EL PROYECTO. Antes de esto, RALLY no mandaba
// ningún correo transaccional: `mailer_autoconfirm` está en true, así que
// Supabase ni siquiera envía el de confirmación de registro. El único correo
// que salía era el de recuperar contraseña, por el SMTP integrado.
//
// POR QUÉ NO EL SMTP DE SUPABASE
//   El servicio integrado está documentado como no apto para producción y
//   limitado a un puñado de envíos por hora. Registrar un torneo son 24
//   correos de golpe: los primeros salen, el resto falla EN SILENCIO. Además
//   su plantilla es global, así que no podría llevar el nombre del torneo, las
//   fechas ni la sede.
//
// RESTRICCIONES DE HTML PARA CORREO (por qué el marcado se ve arcaico)
//   · Tablas, no flexbox ni grid: el motor de Outlook es Word, no un navegador.
//   · Estilos inline: Gmail descarta <style> en algunos contextos.
//   · Google Fonts solo carga en Apple Mail. Todo está diseñado para el
//     FALLBACK (Helvetica/Arial); las fuentes reales son una mejora si llegan.
//   · Sin gradientes en Outlook: el botón lleva `background-color` sólido
//     debajo del `background-image`, así que degrada a oro macizo.
//   · rgba() en bordes es irregular: las líneas hairline van pre-mezcladas a
//     hex sobre el fondo real. Ver LINEA_ORO.
//
// Variables de entorno que necesita la función que lo use:
//   RESEND_API_KEY   — obligatoria
//   EMAIL_FROM       — obligatoria, p. ej. 'RALLY <torneos@tudominio.com>'
//   SITE_URL         — obligatoria, sin barra final

import { formatearRango } from "@/lib/fechas.ts";

// ── Paleta (Doc D §2.1). Duplicada aquí porque design-tokens.ts es del
//    bundle de la app y esto corre en Deno. Si cambia allá, cambia aquí.
const BG          = "#0B0B0D"; // ónix
const SURFACE     = "#17171C";
const SURFACE2    = "#202027";
const TEXT        = "#F4F1E9";
const MUTED       = "#928E84";
const CHAMPAGNE   = "#E9DDB6";
const GOLD        = "#D4AF37";
const GOLD_BRIGHT = "#F1D98C";
const ON_GOLD     = "#1A1407";

// color.line es rgba(212,175,55,0.16). En correo el alfa no es fiable, así que
// va pre-mezclado sobre SURFACE (#17171C):
//   R = .16*212 + .84*23 = 53   G = .16*175 + .84*23 = 47   B = .16*55 + .84*28 = 32
const LINEA_ORO   = "#352F20";
const LINEA_SUAVE = "#26262B"; // idem para color.lineSoft sobre SURFACE

const FUENTE_DISPLAY = "'Oswald','Helvetica Neue',Helvetica,Arial,sans-serif";
const FUENTE_BODY    = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface DatosTorneo {
  nombre:        string;
  fechaInicio:   string;        // 'YYYY-MM-DD' tal como sale de Postgres
  fechaFin:      string;
  sedeNombre:    string | null;
  sedeCiudad:    string | null;
  sedeDireccion: string | null;
  organizador:   string;
  categoria:     string;
  tournamentId:  string;
}

export interface Destinatario {
  email:    string;
  /**
   * A quién va dirigido el saludo. En una cuenta de menor NO es el jugador:
   * el correo va al tutor, que es quien lo va a leer y a activar la cuenta.
   */
  nombre:   string;
}

export interface ResultadoEnvio {
  ok:        boolean;
  messageId: string | null;
  error:     string | null;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Escapa para HTML. NO es cosmético: el nombre del torneo y el del jugador los
 * escribe el organizador, así que son entrada de usuario. Sin esto, un nombre
 * con `&` o `<` rompe el correo — y en el mejor de los casos solo lo rompe.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Primer nombre, para el saludo. 'Juan Pérez López' → 'Juan'. */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre.trim();
}

// El pie cambia según a quién le hablamos: en una cuenta de menor el lector es
// el tutor, y decirle "te inscribieron" sería falso.
const PIE_JUGADOR = "Recibes este correo porque un organizador te inscribió en un torneo de RALLY.";
const PIE_TUTOR   = "Recibe este correo porque un organizador inscribió en un torneo de RALLY a un menor a su cargo.";

// ── Piezas de la plantilla ───────────────────────────────────────────────────

/** Una fila de dato del torneo: etiqueta a la izquierda, valor a la derecha. */
function fila(etiqueta: string, valor: string): string {
  return `
    <tr>
      <td style="padding:7px 0;font-family:${FUENTE_BODY};font-size:12px;color:${MUTED};vertical-align:top;white-space:nowrap;">${esc(etiqueta)}</td>
      <td style="padding:7px 0 7px 16px;font-family:${FUENTE_BODY};font-size:13px;color:${TEXT};text-align:right;vertical-align:top;">${esc(valor)}</td>
    </tr>`;
}

/** Bloque con los datos del torneo. Idéntico en las tres plantillas. */
function bloqueTorneo(t: DatosTorneo): string {
  const sede = t.sedeNombre
    ? (t.sedeCiudad ? `${t.sedeNombre} · ${t.sedeCiudad}` : t.sedeNombre)
    : null;

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background-color:${SURFACE2};border-radius:10px;border:1px solid ${LINEA_SUAVE};">
    <tr>
      <td style="padding:16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${fila("Torneo", t.nombre)}
          ${fila("Fechas", formatearRango(t.fechaInicio, t.fechaFin))}
          ${sede ? fila("Sede", sede) : ""}
          ${t.sedeDireccion ? fila("Dirección", t.sedeDireccion) : ""}
          ${fila("Categoría", t.categoria)}
          ${fila("Organiza", t.organizador)}
        </table>
      </td>
    </tr>
  </table>`;
}

/**
 * Botón dorado.
 *
 * El `background-color` sólido va ANTES del `background-image`: Outlook ignora
 * el gradiente y se queda con el oro macizo, que es exactamente el fallback que
 * queremos. El resto de clientes pintan grad-gold (Doc D §2.3).
 */
function boton(href: string, texto: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center"
          style="background-color:${GOLD};background-image:linear-gradient(150deg,${GOLD_BRIGHT},${GOLD});border-radius:6px;">
        <a href="${esc(href)}"
           style="display:inline-block;padding:14px 28px;font-family:${FUENTE_BODY};font-size:15px;font-weight:600;color:${ON_GOLD};text-decoration:none;letter-spacing:0.3px;">${esc(texto)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * Envoltorio común: fondo ónix, tarjeta centrada con hairline dorado.
 *
 * `preheader` es el texto que los clientes muestran en la bandeja junto al
 * asunto. Si no se pone, Gmail rellena con el primer texto que encuentre —
 * normalmente "Ver este correo en el navegador" o algo igual de inútil.
 */
function layout(opts: {
  titulo:    string;
  preheader: string;
  cuerpo:    string;
  /** Línea del pie. Cambia si el destinatario es el tutor y no el jugador. */
  pie:       string;
}): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- La app ya es oscura: sin esto, algunos clientes "ayudan" invirtiendo los
     colores y dejan texto negro sobre fondo negro. -->
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(opts.titulo)}</title>
<!-- Solo Apple Mail carga esto. Todo lo demás usa el fallback del stack. -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;600&display=swap');
  a { color: ${CHAMPAGNE}; }
  @media only screen and (max-width:620px) {
    .rally-card { padding: 24px 20px !important; }
    .rally-h1   { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BG};">

<!-- Preheader: presente para la bandeja, invisible en el cuerpo. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:${BG};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
             style="max-width:600px;width:100%;">

        <!-- Marca -->
        <tr>
          <td align="center" style="padding-bottom:20px;">
            <span style="font-family:${FUENTE_DISPLAY};font-size:22px;font-weight:600;color:${GOLD};letter-spacing:6px;">RALLY</span>
          </td>
        </tr>

        <!-- Tarjeta -->
        <tr>
          <td class="rally-card"
              style="background-color:${SURFACE};border:1px solid ${LINEA_ORO};border-radius:16px;padding:32px 28px;">
            ${opts.cuerpo}
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td align="center" style="padding:20px 12px 0;">
            <p style="margin:0 0 6px;font-family:${FUENTE_BODY};font-size:11px;line-height:17px;color:${MUTED};">
              ${esc(opts.pie)}
            </p>
            <p style="margin:0;font-family:${FUENTE_BODY};font-size:11px;line-height:17px;color:${MUTED};">
              RALLY · Torneos de padel
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── Plantilla 1 · Cuenta creada ──────────────────────────────────────────────

/**
 * Para quien NO tenía cuenta. El organizador se la acaba de crear.
 *
 * POR QUÉ EL ENLACE NO LLEVA TOKEN
 *   Un `generateLink({type:'recovery'})` caduca (por defecto 1 hora). Si el
 *   organizador da de alta a 24 personas el miércoles para un torneo del
 *   sábado, la mitad de esos enlaces estarán muertos cuando alguien los abra.
 *   En su lugar el botón va a /recuperar con el correo prellenado: el jugador
 *   dispara SU propio correo de recuperación cuando de verdad lo va a usar.
 *   Efecto secundario bueno: esos 24 correos de Supabase se reparten en el
 *   tiempo en vez de salir de golpe contra el límite del SMTP.
 */
export function plantillaCuentaCreada(
  dest: Destinatario,
  t: DatosTorneo,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const url = `${siteUrl}/recuperar?email=${encodeURIComponent(dest.email)}`;
  const nombre = primerNombre(dest.nombre);

  const cuerpo = `
    <p style="margin:0 0 6px;font-family:${FUENTE_DISPLAY};font-size:11px;font-weight:500;color:${CHAMPAGNE};letter-spacing:2.4px;text-transform:uppercase;">
      Te inscribieron en un torneo
    </p>
    <h1 class="rally-h1" style="margin:0 0 16px;font-family:${FUENTE_DISPLAY};font-size:28px;font-weight:600;color:${TEXT};line-height:34px;">
      Hola, ${esc(nombre)}
    </h1>
    <p style="margin:0 0 20px;font-family:${FUENTE_BODY};font-size:15px;line-height:23px;color:${TEXT};">
      <strong style="color:${CHAMPAGNE};">${esc(t.organizador)}</strong> te inscribió en
      <strong style="color:${CHAMPAGNE};">${esc(t.nombre)}</strong> y creó tu cuenta en RALLY con este correo.
    </p>

    ${bloqueTorneo(t)}

    <p style="margin:22px 0 20px;font-family:${FUENTE_BODY};font-size:15px;line-height:23px;color:${TEXT};">
      Solo falta que pongas tu contraseña. Después vas a poder ver tus partidos,
      los horarios y la tabla en vivo desde tu teléfono.
    </p>

    ${boton(url, "Poner mi contraseña")}

    <p style="margin:20px 0 0;font-family:${FUENTE_BODY};font-size:12px;line-height:19px;color:${MUTED};">
      Si el botón no funciona, copia esta dirección en tu navegador:<br>
      <span style="color:${CHAMPAGNE};word-break:break-all;">${esc(url)}</span>
    </p>
    <p style="margin:14px 0 0;font-family:${FUENTE_BODY};font-size:12px;line-height:19px;color:${MUTED};">
      ¿No esperabas esto? Puedes ignorar el correo: sin contraseña, la cuenta no
      se puede usar.
    </p>`;

  const text = [
    `Hola, ${nombre}`,
    ``,
    `${t.organizador} te inscribió en ${t.nombre} y creó tu cuenta en RALLY con este correo.`,
    ``,
    `Torneo:    ${t.nombre}`,
    `Fechas:    ${formatearRango(t.fechaInicio, t.fechaFin)}`,
    t.sedeNombre ? `Sede:      ${t.sedeNombre}${t.sedeCiudad ? " · " + t.sedeCiudad : ""}` : "",
    t.sedeDireccion ? `Dirección: ${t.sedeDireccion}` : "",
    `Categoría: ${t.categoria}`,
    `Organiza:  ${t.organizador}`,
    ``,
    `Solo falta que pongas tu contraseña:`,
    url,
    ``,
    `¿No esperabas esto? Puedes ignorar el correo: sin contraseña, la cuenta no se puede usar.`,
    ``,
    `RALLY · Torneos de padel`,
  ].filter((l) => l !== "").join("\n");

  return {
    subject: `Te inscribieron en ${t.nombre} — activa tu cuenta`,
    html: layout({
      titulo: `Te inscribieron en ${t.nombre}`,
      preheader: `${t.organizador} creó tu cuenta. Pon tu contraseña para ver tus partidos.`,
      cuerpo,
      pie: PIE_JUGADOR,
    }),
    text,
  };
}

// ── Plantilla 2 · Te inscribieron (ya tenía cuenta) ──────────────────────────

/** Para quien YA tenía cuenta. No se le pide contraseña: va directo al torneo. */
export function plantillaTeInscribieron(
  dest: Destinatario,
  t: DatosTorneo,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const url = `${siteUrl}/torneos/${t.tournamentId}`;
  const nombre = primerNombre(dest.nombre);

  const cuerpo = `
    <p style="margin:0 0 6px;font-family:${FUENTE_DISPLAY};font-size:11px;font-weight:500;color:${CHAMPAGNE};letter-spacing:2.4px;text-transform:uppercase;">
      Nueva inscripción
    </p>
    <h1 class="rally-h1" style="margin:0 0 16px;font-family:${FUENTE_DISPLAY};font-size:28px;font-weight:600;color:${TEXT};line-height:34px;">
      Hola, ${esc(nombre)}
    </h1>
    <p style="margin:0 0 20px;font-family:${FUENTE_BODY};font-size:15px;line-height:23px;color:${TEXT};">
      <strong style="color:${CHAMPAGNE};">${esc(t.organizador)}</strong> te inscribió en
      <strong style="color:${CHAMPAGNE};">${esc(t.nombre)}</strong>.
    </p>

    ${bloqueTorneo(t)}

    <p style="margin:22px 0 20px;font-family:${FUENTE_BODY};font-size:15px;line-height:23px;color:${TEXT};">
      Ya está en tu cuenta. Entra para ver tus partidos, los horarios y la tabla
      en vivo cuando arranque el torneo.
    </p>

    ${boton(url, "Ver mis partidos")}

    <p style="margin:20px 0 0;font-family:${FUENTE_BODY};font-size:12px;line-height:19px;color:${MUTED};">
      Si el botón no funciona, copia esta dirección en tu navegador:<br>
      <span style="color:${CHAMPAGNE};word-break:break-all;">${esc(url)}</span>
    </p>
    <p style="margin:14px 0 0;font-family:${FUENTE_BODY};font-size:12px;line-height:19px;color:${MUTED};">
      ¿No deberías estar inscrito? Habla con ${esc(t.organizador)}, que es quien
      gestiona este torneo.
    </p>`;

  const text = [
    `Hola, ${nombre}`,
    ``,
    `${t.organizador} te inscribió en ${t.nombre}.`,
    ``,
    `Torneo:    ${t.nombre}`,
    `Fechas:    ${formatearRango(t.fechaInicio, t.fechaFin)}`,
    t.sedeNombre ? `Sede:      ${t.sedeNombre}${t.sedeCiudad ? " · " + t.sedeCiudad : ""}` : "",
    t.sedeDireccion ? `Dirección: ${t.sedeDireccion}` : "",
    `Categoría: ${t.categoria}`,
    `Organiza:  ${t.organizador}`,
    ``,
    `Ver tus partidos:`,
    url,
    ``,
    `RALLY · Torneos de padel`,
  ].filter((l) => l !== "").join("\n");

  return {
    subject: `Te inscribieron en ${t.nombre}`,
    html: layout({
      titulo: `Te inscribieron en ${t.nombre}`,
      preheader: `${t.categoria} · ${formatearRango(t.fechaInicio, t.fechaFin)}`,
      cuerpo,
      pie: PIE_JUGADOR,
    }),
    text,
  };
}

// ── Plantilla 3 · Cuenta de menor, dirigida al tutor ─────────────────────────

/**
 * Para un jugador menor de edad. Va al correo del TUTOR, no al del chico.
 *
 * POR QUÉ ES UNA PLANTILLA APARTE Y NO LA 1 CON OTRO NOMBRE
 *   Cambia el destinatario, no solo el texto. Aquí se le habla de USTED al
 *   padre o la madre sobre SU HIJO — "inscribieron a Diego", no "te
 *   inscribieron". Reutilizar la plantilla de cuenta creada obligaría a
 *   condicionales dentro de cada frase y saldría un texto que no suena a
 *   nadie.
 *
 * `dest.nombre` es el nombre del TUTOR si se conoce; al darla de alta el
 * organizador no lo captura, así que en la práctica llega el del jugador y el
 * saludo cae al genérico. Por eso el saludo no usa el nombre.
 */
export function plantillaCuentaMenor(
  dest: Destinatario,
  nombreJugador: string,
  t: DatosTorneo,
  siteUrl: string,
  /**
   * false cuando el menor YA tenía cuenta (segundo torneo). Cambia dos frases y
   * el destino del botón: no se le pide activar algo que ya está activo.
   */
  cuentaNueva = true,
): { subject: string; html: string; text: string } {
  const url = cuentaNueva
    ? `${siteUrl}/recuperar?email=${encodeURIComponent(dest.email)}`
    : `${siteUrl}/torneos/${t.tournamentId}`;
  const jugador = esc(nombreJugador);

  const cuerpo = `
    <p style="margin:0 0 6px;font-family:${FUENTE_DISPLAY};font-size:11px;font-weight:500;color:${CHAMPAGNE};letter-spacing:2.4px;text-transform:uppercase;">
      Inscripción de un menor
    </p>
    <h1 class="rally-h1" style="margin:0 0 16px;font-family:${FUENTE_DISPLAY};font-size:28px;font-weight:600;color:${TEXT};line-height:34px;">
      Inscribieron a ${jugador}
    </h1>
    <p style="margin:0 0 20px;font-family:${FUENTE_BODY};font-size:15px;line-height:23px;color:${TEXT};">
      <strong style="color:${CHAMPAGNE};">${esc(t.organizador)}</strong> inscribió a
      <strong style="color:${CHAMPAGNE};">${jugador}</strong> en
      <strong style="color:${CHAMPAGNE};">${esc(t.nombre)}</strong>${cuentaNueva
        ? `, y creó su cuenta en RALLY con este correo porque es menor de 18 años.`
        : `.`}
    </p>

    ${bloqueTorneo(t)}

    <p style="margin:22px 0 20px;font-family:${FUENTE_BODY};font-size:15px;line-height:23px;color:${TEXT};">
      ${cuentaNueva
        ? `La cuenta queda a su nombre como padre, madre o tutor. Al activarla podrá
           poner la contraseña y seguir los partidos, los horarios y la tabla en vivo.`
        : `Ya está en la cuenta que usted administra. Entre para ver sus partidos,
           los horarios y la tabla en vivo cuando arranque el torneo.`}
    </p>

    ${boton(url, cuentaNueva ? "Activar la cuenta" : "Ver sus partidos")}

    <p style="margin:20px 0 0;font-family:${FUENTE_BODY};font-size:12px;line-height:19px;color:${MUTED};">
      Si el botón no funciona, copia esta dirección en su navegador:<br>
      <span style="color:${CHAMPAGNE};word-break:break-all;">${esc(url)}</span>
    </p>
    <p style="margin:14px 0 0;font-family:${FUENTE_BODY};font-size:12px;line-height:19px;color:${MUTED};">
      ${cuentaNueva
        ? `Al activar la cuenta se le pedirá aceptar los términos como tutor de ${jugador}.`
        : ``}
      Si no autoriza esta inscripción, hable con ${esc(t.organizador)}, que
      gestiona el torneo.
    </p>`;

  const text = [
    `Inscribieron a ${nombreJugador}`,
    ``,
    cuentaNueva
      ? `${t.organizador} inscribió a ${nombreJugador} en ${t.nombre}, y creó su cuenta en RALLY con este correo porque es menor de 18 años.`
      : `${t.organizador} inscribió a ${nombreJugador} en ${t.nombre}.`,
    ``,
    `Torneo:    ${t.nombre}`,
    `Fechas:    ${formatearRango(t.fechaInicio, t.fechaFin)}`,
    t.sedeNombre ? `Sede:      ${t.sedeNombre}${t.sedeCiudad ? " · " + t.sedeCiudad : ""}` : "",
    t.sedeDireccion ? `Dirección: ${t.sedeDireccion}` : "",
    `Categoría: ${t.categoria}`,
    `Organiza:  ${t.organizador}`,
    ``,
    cuentaNueva
      ? `La cuenta queda a su nombre como padre, madre o tutor. Actívela aquí:`
      : `Ver sus partidos:`,
    url,
    ``,
    cuentaNueva
      ? `Al activarla se le pedirá aceptar los términos como tutor de ${nombreJugador}.`
      : ``,
    ``,
    `RALLY · Torneos de padel`,
  ].filter((l) => l !== "").join("\n");

  return {
    subject: cuentaNueva
      ? `Inscribieron a ${nombreJugador} en ${t.nombre} — activa su cuenta`
      : `Inscribieron a ${nombreJugador} en ${t.nombre}`,
    html: layout({
      titulo: `Inscribieron a ${nombreJugador} en ${t.nombre}`,
      preheader: cuentaNueva
        ? `Activa la cuenta para seguir sus partidos. ${t.categoria}.`
        : `${t.categoria} · ${formatearRango(t.fechaInicio, t.fechaFin)}`,
      cuerpo,
      pie: PIE_TUTOR,
    }),
    text,
  };
}

// ── Envío ────────────────────────────────────────────────────────────────────

/**
 * Manda un correo por Resend.
 *
 * NUNCA lanza: devuelve {ok:false, error}. Quien llama está en un camino donde
 * la inscripción YA se guardó, y un fallo de correo no puede tumbar esa
 * respuesta ni disparar el rollback. El error se guarda en email_outbox para
 * que el organizador pueda reenviarlo.
 */
export async function enviarCorreo(params: {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
}): Promise<ResultadoEnvio> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from   = Deno.env.get("EMAIL_FROM");

  if (!apiKey) return { ok: false, messageId: null, error: "missing_RESEND_API_KEY" };
  if (!from)   return { ok: false, messageId: null, error: "missing_EMAIL_FROM" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    const body = await res.json().catch(() => null) as
      { id?: string; message?: string; name?: string } | null;

    if (!res.ok) {
      // Resend devuelve {name, message}. El name es lo accionable
      // ('validation_error', 'restricted_api_key'…), el message lo explica.
      const detalle = body?.name
        ? `${body.name}: ${body.message ?? ""}`.trim()
        : `http_${res.status}`;
      return { ok: false, messageId: null, error: detalle };
    }

    return { ok: true, messageId: body?.id ?? null, error: null };
  } catch (e) {
    // Red caída, DNS, timeout. Reintentable, a diferencia de un 4xx.
    return { ok: false, messageId: null, error: `network: ${String((e as Error)?.message ?? e)}` };
  }
}
