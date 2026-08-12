"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "dataflow-theme";

function resolveInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  // Le clair est toujours la valeur par défaut (voir globals.css) — seule une
  // bascule explicite précédemment enregistrée (voir THEME_INIT_SCRIPT dans
  // layout.tsx) peut donner "dark" ici.
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Bascule manuelle clair/sombre, en plus du suivi automatique des
 * préférences système. Isolé en Client Component pour que le layout parent
 * ((app)/layout.tsx) reste un Server Component — voir CLAUDE.md.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm btn-icon"
      title="Basculer le thème clair / sombre"
      aria-label="Basculer le thème"
      onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
    >
      <span className="theme-icon-light" aria-hidden="true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      </span>
      <span className="theme-icon-dark" aria-hidden="true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
    </button>
  );
}
