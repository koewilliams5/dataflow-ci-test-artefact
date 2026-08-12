import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell">
      <div className="auth-card fade-in">
        <div className="auth-logo">
          <span className="auth-logo-mark">
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 7c0-1.7 4-3 9-3s9 1.3 9 3-4 3-9 3-9-1.3-9-3Z" />
              <path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3" />
              <path d="M3 7v10c0 1.7 4 3 9 3s9-1.3 9-3V7" />
            </svg>
          </span>
          <div>
            <p className="auth-title">DataFlow CI</p>
            <p className="auth-subtitle">Console de validation des fichiers clients</p>
          </div>
        </div>
        <LoginForm />
        <p className="auth-footer">
          Accès réservé — les comptes sont créés par un administrateur.
        </p>
      </div>
    </main>
  );
}
