import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../auth";
import { logoutAction } from "../../lib/auth/actions";
import { ThemeToggle } from "../ThemeToggle";
import { NavLinks } from "./NavLinks";

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

  const email = session.user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dashboard" className="brand" aria-label="DataFlow CI — accueil">
            <span className="brand-mark">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7c0-1.7 4-3 9-3s9 1.3 9 3-4 3-9 3-9-1.3-9-3Z" />
                <path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3" />
                <path d="M3 7v10c0 1.7 4 3 9 3s9-1.3 9-3V7" />
              </svg>
            </span>
            DataFlow<span className="brand-suffix">CI</span>
          </Link>

          <NavLinks />

          <span className="spacer" />

          <ThemeToggle />

          <span className="user-chip">
            <span className="avatar">{initials}</span>
            <span className="truncate user-chip-email" title={email}>
              {email}
            </span>
          </span>

          <span className="header-divider" />

          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost btn-sm" title="Se déconnecter">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              <span className="btn-label">Déconnexion</span>
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
