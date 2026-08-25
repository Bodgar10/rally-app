// pair-register-manual — el organizador registra una pareja a mano, creando
// las cuentas que hagan falta.
//
// EL PROBLEMA QUE RESUELVE
//   Hasta hoy los dos jugadores tenían que existir ya en public.users. Para un
//   torneo de 12 parejas eso significa pedirle a 24 personas que se registren
//   antes. Ahora el organizador crea la cuenta él mismo con los datos que ya
//   le pide a todo el mundo: nombre, correo y teléfono.
//
// POR QUÉ UNA SOLA FUNCIÓN Y NO "crear usuario" + "insertar pareja"
//   auth.users y public.pairs NO comparten transacción. Si fueran dos llamadas
//   y la segunda fallara (categoría cerrada, pareja duplicada), quedarían
//   cuentas fantasma sin forma de saber que sobran. Aquí la compensación es
//   explícita: si el insert de la pareja falla, se borran las cuentas que ESTA
//   llamada creó — y solo esas.
//
// MENORES DE EDAD
//   Un chico de 15 años no gestiona su cuenta: va con su familia al club. Si
//   el organizador marca "es menor", el correo capturado es el del TUTOR y el
//   nombre sigue siendo el del jugador (es quien sale en el cuadro y en el
//   ranking). El mismo correo va a users.email y a users.parent_email, que es
//   la marca de tutela que después lee la pantalla de activación.
//   Se registra la declaración del organizador EN AMBOS CASOS: ver
//   player_age_declarations en la migración 037.
//
// LOS CORREOS NO BLOQUEAN LA RESPUESTA
//   Se escriben en email_outbox ANTES de responder (así el fallo nunca es
//   invisible) y se envían después, con EdgeRuntime.waitUntil. Si Resend está
//   caído, la pareja quedó inscrita igual y el organizador ve el fallo y
//   reenvía desde la pantalla.
//
// Variables de entorno: RESEND_API_KEY, EMAIL_FROM, SITE_URL.

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";
import { getActor, isOrgOwner } from "../_shared/auth.ts";
import { procesarFila, trasResponder, siteUrl, type TipoCorreo, type PayloadOutbox } from "../_shared/outbox.ts";
import type { DatosTorneo } from "../_shared/email.ts";

/** Texto EXACTO que se le muestra al organizador. Se archiva con la declaración. */
const DECLARACION = "El organizador declara conocer la edad del jugador. Si es menor de 18 años, " +
  "el correo registrado es el del padre, madre o tutor, que activará la cuenta y aceptará los términos.";

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface JugadorExistente { mode: "existing"; user_id: string }
interface JugadorNuevo {
  mode:       "new";
  full_name:  string;   // SIEMPRE el del jugador, también en cuentas de menor
  email:      string;   // el del tutor si is_minor
  phone?:     string;
  is_minor:   boolean;
}
type JugadorEntrada = JugadorExistente | JugadorNuevo;

interface Resuelto {
  userId:      string;
  email:       string;
  nombre:      string;   // nombre del JUGADOR
  esNuevo:     boolean;
  esMenor:     boolean;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ ok: false, error: "unauthenticated" }, 401);

  let body: {
    tournament_id?: string;
    category_id?:   string;
    players?:       JugadorEntrada[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const { tournament_id, category_id, players } = body;
  if (!tournament_id || !category_id) return json({ ok: false, error: "missing_ids" }, 400);
  if (!Array.isArray(players) || players.length !== 2) {
    return json({ ok: false, error: "need_two_players" }, 400);
  }

  const supa = adminClient();

  // ── 1. Autorización ────────────────────────────────────────────────────────
  // adminClient BYPASSEA la RLS, así que la propiedad del torneo se comprueba
  // aquí a mano. Sin esto, cualquier autenticado podría inscribir en el torneo
  // de otro.
  const { data: torneo } = await supa
    .from("tournaments")
    .select("id, name, start_date, end_date, organizer_id, venue_id, status")
    .eq("id", tournament_id)
    .maybeSingle();

  if (!torneo) return json({ ok: false, error: "tournament_not_found" }, 404);
  if (!(await isOrgOwner(torneo.organizer_id, actor))) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  // ── 2. La categoría tiene que ser de ESTE torneo y estar abierta ───────────
  const { data: categoria } = await supa
    .from("categories")
    .select("id, display_name, status, tournament_id")
    .eq("id", category_id)
    .maybeSingle();

  if (!categoria || categoria.tournament_id !== tournament_id) {
    return json({ ok: false, error: "category_not_found" }, 404);
  }
  if (categoria.status !== "open") {
    return json({ ok: false, error: "category_closed" }, 409);
  }

  // ── 3. Resolver los dos jugadores ──────────────────────────────────────────
  // `creados` lleva la cuenta de lo que hay que deshacer si algo falla después.
  const creados: string[] = [];
  const resueltos: Resuelto[] = [];

  // Se resuelve una sola vez, fuera del bucle: es el mismo actor para los dos
  // jugadores y se archiva como instantánea en cada declaración de edad.
  const correoActor =
    (await supa.from("users").select("email").eq("id", actor.id).maybeSingle()).data?.email
    ?? "desconocido";

  async function deshacer(): Promise<void> {
    // Solo las cuentas que creó ESTA llamada. Un usuario preexistente jamás se
    // toca, por muy mal que haya salido el resto.
    for (const id of creados) {
      await supa.auth.admin.deleteUser(id).catch(() => {});
    }
  }

  for (const p of players) {
    if (p?.mode === "existing") {
      if (!p.user_id) { await deshacer(); return json({ ok: false, error: "missing_user_id" }, 400); }

      const { data: u } = await supa
        .from("users").select("id, email, full_name, parent_email")
        .eq("id", p.user_id).maybeSingle();

      if (!u) { await deshacer(); return json({ ok: false, error: "user_not_found" }, 404); }

      resueltos.push({
        userId: u.id, email: u.email, nombre: u.full_name,
        esNuevo: false, esMenor: u.parent_email !== null,
      });
      continue;
    }

    if (p?.mode !== "new") { await deshacer(); return json({ ok: false, error: "invalid_player_mode" }, 400); }

    const nombre = (p.full_name ?? "").trim();
    const email  = (p.email ?? "").trim().toLowerCase();
    const phone  = (p.phone ?? "").trim();

    if (nombre.length < 3)     { await deshacer(); return json({ ok: false, error: "invalid_name" }, 400); }
    if (!RE_EMAIL.test(email)) { await deshacer(); return json({ ok: false, error: "invalid_email" }, 400); }
    if (typeof p.is_minor !== "boolean") {
      // No se asume "adulto" por omisión: la declaración de edad es obligatoria
      // y es la que traslada la responsabilidad al organizador.
      await deshacer();
      return json({ ok: false, error: "age_declaration_required" }, 400);
    }

    // Un correo ya usado NO es un error del organizador: es que se equivocó de
    // rama. Se devuelve la persona encontrada para que la UI ofrezca usarla.
    const { data: yaExiste } = await supa
      .from("users").select("id, full_name").eq("email", email).maybeSingle();

    if (yaExiste) {
      await deshacer();
      return json({
        ok: false,
        error: "email_already_exists",
        existing_user: { id: yaExiste.id, full_name: yaExiste.full_name },
      }, 409);
    }

    // email_confirm: true — el correo lo dio el organizador con la persona
    // delante, y mandar un segundo correo de confirmación antes del de
    // bienvenida solo confundiría. tos_version NO se manda: nadie ha aceptado
    // nada todavía; se acepta al activar la cuenta.
    const { data: creado, error: errCrear } = await supa.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: nombre,
        phone:     phone || undefined,
        // La marca de tutela. El trigger handle_new_user (037) la copia a
        // public.users.parent_email, que es lo que lee la activación.
        parent_email: p.is_minor ? email : undefined,
        created_by:   "organizer",
        created_by_organizer: torneo.organizer_id,
      },
    });

    if (errCrear || !creado?.user) {
      await deshacer();
      return json({ ok: false, error: "create_user_failed", detail: errCrear?.message ?? null }, 500);
    }

    creados.push(creado.user.id);

    // La declaración de edad se archiva SIEMPRE, diga lo que diga. Guardar solo
    // el "sí es menor" convertiría el "no" en ausencia de dato, indistinguible
    // de que nadie preguntara.
    await supa.from("player_age_declarations").insert({
      user_id:           creado.user.id,
      declared_minor:    p.is_minor,
      declared_by:       actor.id,
      declared_by_email: correoActor,
      tournament_id:     tournament_id,
      statement:         DECLARACION,
    });

    resueltos.push({
      userId: creado.user.id, email, nombre,
      esNuevo: true, esMenor: p.is_minor,
    });
  }

  const [j1, j2] = resueltos;
  if (j1.userId === j2.userId) {
    await deshacer();
    return json({ ok: false, error: "same_player_twice" }, 400);
  }

  // ── 4. La pareja ───────────────────────────────────────────────────────────
  const { data: pareja, error: errPareja } = await supa
    .from("pairs")
    .insert({
      tournament_id,
      category_id,
      player1_id:     j1.userId,
      player2_id:     j2.userId,
      payment_status: "paid_offline",
    })
    .select("id")
    .single();

  if (errPareja || !pareja) {
    // Aquí es donde importa la compensación: si no, quedan cuentas colgando.
    await deshacer();
    const code = errPareja?.code === "23505" ? "pair_duplicate" : "pair_insert_failed";
    return json({ ok: false, error: code, detail: errPareja?.message ?? null }, 409);
  }

  // ── 5. Datos del torneo para los correos ───────────────────────────────────
  const { data: sede } = torneo.venue_id
    ? await supa.from("venues").select("name, city, address").eq("id", torneo.venue_id).maybeSingle()
    : { data: null };

  const { data: org } = await supa
    .from("organizers").select("name").eq("id", torneo.organizer_id).maybeSingle();

  const datosTorneo: DatosTorneo = {
    nombre:        torneo.name,
    fechaInicio:   torneo.start_date,
    fechaFin:      torneo.end_date,
    sedeNombre:    sede?.name ?? null,
    sedeCiudad:    sede?.city ?? null,
    sedeDireccion: sede?.address ?? null,
    organizador:   org?.name ?? "el organizador",
    categoria:     categoria.display_name,
    tournamentId:  tournament_id,
  };

  // ── 6. Bandeja de salida ───────────────────────────────────────────────────
  // Se ESCRIBE antes de responder y se ENVÍA después. Así, aunque el envío
  // muera a medias, queda la fila en 'pending' y se puede reenviar.
  const aEncolar = resueltos.map((r) => {
    // Cuatro casos, y la distinción menor/adulto vale también para las cuentas
    // que YA existían: un menor inscrito en un segundo torneo sigue teniendo al
    // tutor al otro lado del buzón, y "Hola, Diego" ahí estaría mal dirigido.
    const kind: TipoCorreo = r.esNuevo
      ? (r.esMenor ? "minor_account_created" : "account_created")
      : (r.esMenor ? "minor_registered"      : "registered");

    const esParaTutor = kind === "minor_account_created" || kind === "minor_registered";

    const payload: PayloadOutbox = {
      destinatario: { email: r.email, nombre: r.nombre },
      torneo:       datosTorneo,
      ...(esParaTutor ? { nombreJugador: r.nombre } : {}),
    };

    return {
      kind,
      to_email:      r.email,
      to_user_id:    r.userId,
      tournament_id,
      pair_id:       pareja.id,
      payload,
      status:        "pending",
    };
  });

  const { data: filas } = await supa
    .from("email_outbox").insert(aEncolar).select("id, kind, to_email, payload, attempts");

  // El envío va después de responder. Si waitUntil no existe (Deno local),
  // arranca igual y el proceso lo termina cuando pueda.
  if (filas?.length) {
    const url = siteUrl();
    trasResponder(
      Promise.all(filas.map((f) => procesarFila(supa, f as never, url))),
    );
  }

  return json({
    ok: true,
    pair_id: pareja.id,
    players: resueltos.map((r) => ({
      user_id:  r.userId,
      full_name: r.nombre,
      is_new:   r.esNuevo,
      is_minor: r.esMenor,
    })),
    // La UI las usa para consultar email_outbox y ofrecer reenvío si fallan.
    outbox_ids: (filas ?? []).map((f) => f.id),
  });
});
