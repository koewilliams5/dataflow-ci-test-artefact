"use client";

import { useEffect } from "react";

export default function SourcesError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="error-state">
      <p>Impossible de charger les sources pour le moment.</p>
      <button type="button" onClick={reset}>
        Réessayer
      </button>
    </div>
  );
}
