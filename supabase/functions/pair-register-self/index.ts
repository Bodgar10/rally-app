// pair-register-self — el JUGADOR se inscribe y, si hace falta, crea la cuenta
// de su pareja.
//
// POR QUÉ NO SIRVE pair-register-manual
//   Aquella exige `isOrgOwner` y fuerza payment_status = 'paid_offline', porque
//   modela al organizador cobrando fuera de la plataforma. Aquí el que llama es
//   el propio jugador, la cuota se cobra por Stripe y la pareja nace 'pending'
//   hasta que el webhook la liquida. Añadir ramas a la otra habría metido dos
//   flujos de autorización y dos de cobro en la misma función.
//
//   Lo que sí se comparte: la creación de cuentas, la declaración de edad, la
//   compensación y la bandeja de correo. Todo eso vive en _shared.
//
// QUIÉN PUEDE LLAMARLA
//   Cualquier autenticado, y siempre se inscribe A SÍ MISMO: player1 es
//   `actor.id`, nunca un id que venga del cliente. Sin eso, cualquiera podría
//   inscribir a terceros.
//
// Variables de entorno: RESEND_API_KEY, EMAIL_FROM, SITE_URL.

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";
import { getActor } from "../_shared/auth.ts";
import { procesarFila, trasResponder, siteUrl, type TipoCorreo, type PayloadOutbox } from "../_shared/outbox.ts";
import type { DatosTorneo } from "../_shared/email.ts";

/** Texto EXACTO que se le muestra a quien inscribe. Se archiva con la declaración. */
const DECLARACION = "Quien inscribe declara conocer la edad de su pareja. Si es menor de 18 años, " +
  "el correo registrado es el del padre, madre o tutor, que activará la cuenta y aceptará los términos.";

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface ParejaExistente { mode: "existing"; user_id: string }
interface ParejaNueva {
  mode:      "new";
  full_name: string;
  email:     string;
  phone?:    string;
  is_minor:  boolean;
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
    partner?:       ParejaExistente | ParejaNueva;
    schedule_preference?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const { tournament_id, category_id, partner } = body;
  if (!tournament_id || !category_id) return json({ ok: false, error: "missing_ids" }, 400);
  if (!partner) return json({ ok: false, error: "missing_partner" }, 400);

  const horario = ["morning", "afternoon", "any"].includes(body.schedule_preference ?? "")
    ? body.schedule_preference!
    : "any";

  const supa = adminClient();

  // ── Torneo y categoría ────────────────────────────────────────────────────
  const { data: torneo } = await supa
    .from("tournaments")
    .select("id, name, start_date, end_date, organizer_id, venue_id, status, registration_fee")
    .eq("id", tournament_id)
    .maybeSingle();

  if (!torneo) return json({ ok: false, error: "tournament_not_found" }, 404);

  // adminClient bypasea la RLS, así que la regla de `pairs_insert` (solo con
  // inscripciones abiertas) se revalida aquí a mano.
  if (torneo.status !== "registration_open") {
    return json({ ok: false, error: "registration_closed" }, 409);
  }

  const { data: categoria } = await supa
    .from("categories")
    .select("id, display_name, status, tournament_id, fee_override")
    .eq("id", category_id)
    .maybeSingle();

  if (!categoria || categoria.tournament_id !== tournament_id) {
    return json({ ok: false, error: "category_not_found" }, 404);
  }
  if (categoria.status !== "open") {
    return json({ ok: false, error: "category_closed" }, 409);
  }

  // ── Resolver a la pareja ──────────────────────────────────────────────────
  const creados: string[] = [];
  async function deshacer(): Promise<void> {
    for (const id of creados) await supa.auth.admin.deleteUser(id).catch(() => {});
  }

  let partnerId: string;
  let partnerEmail: string;
  let partnerNombre: string;
  let partnerEsNuevo = false;
  let partnerEsMenor = false;

  if (partner.mode === "existing") {
    if (!partner.user_id) return json({ ok: false, error: "missing_user_id" }, 400);

    const { data: u } = await supa
      .from("users").select("id, email, full_name, parent_email")
      .eq("id", partner.user_id).maybeSingle();

    if (!u) return json({ ok: false, error: "user_not_found" }, 404);

    partnerId     = u.id;
    partnerEmail  = u.email;
    partnerNombre = u.full_name;
    partnerEsMenor = u.parent_email !== null;
  } else if (partner.mode === "new") {
    const nombre = (partner.full_name ?? "").trim();
    const email  = (partner.email ?? "").trim().toLowerCase();
    const phone  = (partner.phone ?? "").trim();

    if (nombre.length < 3)     return json({ ok: false, error: "invalid_name" }, 400);
    if (!RE_EMAIL.test(email)) return json({ ok: false, error: "invalid_email" }, 400);
    if (typeof partner.is_minor !== "boolean") {
      return json({ ok: false, error: "age_declaration_required" }, 400);
    }

    // Un correo ya usado no es un error: es que se equivocó de rama.
    const { data: yaExiste } = await supa
      .from("users").select("id, full_name").eq("email", email).maybeSingle();

    if (yaExiste) {
      return json({
        ok: false, error: "email_already_exists",
        existing_user: { id: yaExiste.id, full_name: yaExiste.full_name },
      }, 409);
    }

    const { data: creado, error: errCrear } = await supa.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name:    nombre,
        phone:        phone || undefined,
        parent_email: partner.is_minor ? email : undefined,
        created_by:   "player",
        created_by_player: actor.id,
      },
    });

    if (errCrear || !creado?.user) {
      return json({ ok: false, error: "create_user_failed", detail: errCrear?.message ?? null }, 500);
    }

    creados.push(creado.user.id);
    partnerId      = creado.user.id;
    partnerEmail   = email;
    partnerNombre  = nombre;
    partnerEsNuevo = true;
    partnerEsMenor = partner.is_minor;

    const correoActor =
      (await supa.from("users").select("email").eq("id", actor.id).maybeSingle()).data?.email
      ?? "desconocido";

    await supa.from("player_age_declarations").insert({
      user_id:           creado.user.id,
      declared_minor:    partner.is_minor,
      declared_by:       actor.id,
      declared_by_email: correoActor,
      tournament_id,
      statement:         DECLARACION,
    });
  } else {
    return json({ ok: false, error: "invalid_partner_mode" }, 400);
  }

  if (partnerId === actor.id) {
    await deshacer();
    return json({ ok: false, error: "same_player_twice" }, 400);
  }

  // ── La pareja ─────────────────────────────────────────────────────────────
  // Con cuota > 0 nace 'pending' y la liquida el webhook de Connect tras el
  // checkout. Torneo gratis se queda 'paid_offline': no hay cobro que hacer.
  const cuota = categoria.fee_override ?? torneo.registration_fee ?? 0;

  const { data: pareja, error: errPareja } = await supa
    .from("pairs")
    .insert({
      tournament_id,
      category_id,
      player1_id:          actor.id,   // SIEMPRE el que llama
      player2_id:          partnerId,
      schedule_preference: horario,
      payment_status:      cuota > 0 ? "pending" : "paid_offline",
    })
    .select("id")
    .single();

  if (errPareja || !pareja) {
    await deshacer();
    const code = errPareja?.code === "23505" ? "pair_duplicate" : "pair_insert_failed";
    return json({ ok: false, error: code, detail: errPareja?.message ?? null }, 409);
  }

  // ── Correo a la pareja ────────────────────────────────────────────────────
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

  const kind: TipoCorreo = partnerEsNuevo
    ? (partnerEsMenor ? "minor_account_created" : "account_created")
    : (partnerEsMenor ? "minor_registered"      : "registered");

  const esParaTutor = kind === "minor_account_created" || kind === "minor_registered";

  const payload: PayloadOutbox = {
    destinatario: { email: partnerEmail, nombre: partnerNombre },
    torneo:       datosTorneo,
    ...(esParaTutor ? { nombreJugador: partnerNombre } : {}),
  };

  // Solo a la pareja: quien llama ya sabe que se inscribió, lo acaba de hacer.
  const { data: filas } = await supa
    .from("email_outbox")
    .insert([{
      kind, to_email: partnerEmail, to_user_id: partnerId,
      tournament_id, pair_id: pareja.id, payload, status: "pending",
    }])
    .select("id, kind, to_email, payload, attempts");

  if (filas?.length) {
    const url = siteUrl();
    trasResponder(Promise.all(filas.map((f) => procesarFila(supa, f as never, url))));
  }

  return json({
    ok: true,
    pair_id:          pareja.id,
    partner_is_new:   partnerEsNuevo,
    partner_is_minor: partnerEsMenor,
    requires_payment: cuota > 0,
  });
});
