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
    <div className="anomaly-block">
      <h2>Copilot qualité de données</h2>
      {state.status === "idle" ? (
        <>
          <p className="empty-state">
            Génère une explication en langage clair des erreurs les plus fréquentes de ce fichier.
          </p>
          <button type="button" onClick={() => void handleClick()}>
            Expliquer les erreurs avec l&apos;IA
          </button>
        </>
      ) : null}
      {state.status === "loading" ? <p className="loading-state">Analyse en cours…</p> : null}
      {state.status === "explained" ? <p>{state.explanation}</p> : null}
      {state.status === "unavailable" ? (
        <p className="empty-state">
          {UNAVAILABLE_MESSAGES[state.reason] ?? "Fonctionnalité IA indisponible pour le moment."}
        </p>
      ) : null}
    </div>
  );
}
