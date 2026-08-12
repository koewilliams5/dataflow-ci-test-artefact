import type { Session } from "next-auth";
import { auth } from "../../auth";
import { jsonError, type ApiErrorBody } from "./responses";
import type { NextResponse } from "next/server";

export type RequireSessionResult =
  | { session: Session & { user: Session["user"] }; response: null }
  | { session: null; response: NextResponse<ApiErrorBody> };

/**
 * Vérification d'authentification au niveau de chaque route API, en plus du
 * middleware (défense en profondeur — voir DECISIONS.md, sécurité). Retourne
 * soit la session, soit une 401 prête à renvoyer telle quelle.
 */
export async function requireSession(): Promise<RequireSessionResult> {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: jsonError(401, "Authentification requise.") };
  }
  return { session: session as Session & { user: Session["user"] }, response: null };
}
