import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../auth";
import { logoutAction } from "../../lib/auth/actions";

// Deuxième vérification de session en plus du middleware (défense en
// profondeur, voir DESIGN.md/section sécurité) : le middleware gère la
// redirection au niveau routage, ce layout garantit qu'aucune donnée n'est
// jamais rendue côté serveur sans session valide, même si le middleware était
// contourné ou mal configuré pour un sous-chemin.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return (
    <div>
      <header>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/sources">Sources</Link>
          <Link href="/ingestions">Ingestions</Link>
        </nav>
        <div>
          <span>{session.user.email}</span>
          <form action={logoutAction}>
            <button type="submit">Déconnexion</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
