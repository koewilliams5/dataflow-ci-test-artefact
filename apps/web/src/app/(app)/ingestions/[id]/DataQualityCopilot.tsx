"use client";

import { useState } from "react";

type CopilotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "explained"; explanation: string }
  | { status: "unavailable"; reason: string };

const UNAVAILABLE_MESSAGES: Record<string, string> = {
  not_configured: "Le Copilot IA n'est pas configuré sur cet environnement.",
  no_errors: "Aucune erreur à expliquer.",
  request_failed: "Le service IA est momentanément indisponible. Réessayez plus tard.",
  invalid_response: "Le service IA a renvoyé une réponse inattendue. Réessayez plus tard.",
};

function SparkleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Bouton à la demande, jamais déclenché automatiquement (voir ADR-034) — le
 * moteur de validation déterministe reste la seule source de vérité, l'IA
 * n'est qu'une explication additionnelle et se dégrade sans jamais casser la
 * page si le service est indisponible ou non configuré.
 */
export function DataQualityCopilot({ ingestionId }: { ingestionId: string }) {
  const [state, setState] = useState<CopilotState>({ status: "idle" });

  async function handleClick() {
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/ingestions/${ingestionId}/copilot`, { method: "POST" });
      const body = (await response.json()) as
        | { available: true; explanation: string }
        | { available: false; reason: string };

      if (body.available) {
        setState({ status: "explained", explanation: body.explanation });
      } else {
        setState({ status: "unavailable", reason: body.reason });
      }
    } catch {
      setState({ status: "unavailable", reason: "request_failed" });
    }
  }

  return (
    <div className="ai-panel">
      <p className="ai-panel-header">
        <SparkleIcon />
        Copilot qualité de données
      </p>

      {state.status === "idle" ? (
        <div className="row-between row-wrap">
          <p className="text-sm muted grow">
            Génère une explication en langage clair des erreurs les plus fréquentes de ce fichier.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleClick()}>
            <SparkleIcon />
            Expliquer les erreurs
          </button>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <p className="row-2 text-sm muted">
          <span className="spinner" />
          Analyse en cours…
        </p>
      ) : null}

      {state.status === "explained" ? <p className="text-sm">{state.explanation}</p> : null}

      {state.status === "unavailable" ? (
        <p className="text-sm muted">
          {UNAVAILABLE_MESSAGES[state.reason] ?? "Fonctionnalité IA indisponible pour le moment."}
        </p>
      ) : null}
    </div>
  );
}
