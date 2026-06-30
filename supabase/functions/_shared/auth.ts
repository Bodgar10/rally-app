// _shared/auth.ts — patrón Opus: la Edge Function autentica el JWT y resuelve el actor explícito.
// Las RPCs corren con service_role (auth.uid() NULL), por eso la autorización se hace aquí.
import { adminClient } from "./clients.ts";

export interface Actor {
  id: string;
  role: string; // 'player' | 'admin' (modelo Airbnb; organizer/judge viven en organizer_members)
}

/** Valida el Bearer JWT y devuelve el actor, o null si no hay sesión válida. */
export async function getActor(req: Request): Promise<Actor | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const supa = adminClient();
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await supa
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  return { id: data.user.id, role: profile?.role ?? "player" };
}

/** True si el actor es OWNER del organizador (organizer_members.member_role='owner') o admin. */
export async function isOrgOwner(organizerId: string, actor: Actor): Promise<boolean> {
  if (actor.role === "admin") return true;
  const supa = adminClient();
  const { data } = await supa
    .from("organizer_members")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("user_id", actor.id)
    .eq("member_role", "owner")
    .maybeSingle();
  return !!data;
}
