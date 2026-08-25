// activate-account — el jugador crea su contraseña y entra, sin correo de por medio.
//
// EL PROBLEMA
//   El organizador da de alta a 24 personas y a una no le llega el correo —
//   spam, dominio mal escrito, Resend caído. Esa persona tiene cuenta pero no
//   tiene contraseña, así que no puede entrar por ningún lado.
//
//   El enlace de recuperación tampoco la salva si el correo no llega. La única
//   salida que no depende del correo es dejar que ponga la contraseña ahí
//   mismo.
//
// POR QUÉ ESTO NO ES UN AGUJERO
//   Solo funciona sobre cuentas en 'needs_activation': creadas por un
//   organizador y NUNCA usadas. En cuanto una cuenta tiene contraseña, esta
//   función la rechaza — no puede secuestrar una cuenta activa.
//
//   Lo que sí concede: quien sepa el correo de alguien recién dado de alta
//   puede quedarse con esa cuenta antes que su dueño. Es una ventana estrecha
//   y el daño está acotado (una cuenta sin historial, sin pagos, sin nada), y
//   es el precio de que el jugador pueda entrar sin depender del correo. La
//   alternativa —dejarlo fuera— ya se probó y no funciona.
//
//   NO se usa el JWT del llamante a propósito: quien llama aquí no tiene
//   sesión, por definición.
//
// POR QUÉ EDGE FUNCTION Y NO EL CLIENTE
//   `auth.updateUser({ password })` exige sesión. Poner la contraseña de otro
//   exige service_role, que nunca puede vivir en el bundle.

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

/** Mismo mínimo que nueva-contrasena.tsx y que el registro. */
const MIN_PASSWORD = 8;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const email    = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email)                     return json({ ok: false, error: "invalid_email" }, 400);
  if (password.length < MIN_PASSWORD) return json({ ok: false, error: "weak_password" }, 400);

  const supa = adminClient();

  // La MISMA fuente de verdad que usa el login para decidir el paso 2. Si se
  // duplicara la condición aquí, las dos se desincronizarían a la primera que
  // alguien tocara una sola.
  const { data: estado, error: errEstado } = await supa
    .rpc("auth_email_status", { p_email: email });

  if (errEstado) {
    return json({ ok: false, error: "status_check_failed", detail: errEstado.message }, 500);
  }

  if (estado === "not_found") {
    return json({ ok: false, error: "not_found" }, 404);
  }

  if (estado !== "needs_activation") {
    // Ya tiene contraseña: que entre por el login normal o recupere por correo.
    return json({ ok: false, error: "already_active" }, 409);
  }

  // El id no viene del cliente nunca: se resuelve aquí por correo.
  const { data: fila } = await supa
    .from("users").select("id").eq("email", email).maybeSingle();

  if (!fila?.id) {
    // auth.users tiene la fila pero public.users no: el trigger de provisión
    // falló en su día. Sin id no se puede continuar.
    return json({ ok: false, error: "profile_missing" }, 500);
  }

  const { error: errUpd } = await supa.auth.admin.updateUserById(fila.id, {
    password,
    // Sella la cuenta como activada por su dueño. Sin esto, auth_email_status
    // podría seguir devolviendo 'needs_activation' si GoTrue no marca
    // last_sign_in_at hasta el primer login — y la ventana seguiría abierta.
    user_metadata: { created_by: "self_activated" },
  });

  if (errUpd) {
    return json({ ok: false, error: "activation_failed", detail: errUpd.message }, 500);
  }

  // No se devuelve sesión: el cliente hace signInWithPassword acto seguido con
  // la contraseña que acaba de elegir. Así la sesión la crea el SDK con su
  // propio almacenamiento y refresco, y aquí no viaja ningún token.
  return json({ ok: true });
});
