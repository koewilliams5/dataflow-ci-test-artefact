"use client";

import { useEffect } from "react";

export default function IngestionsError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="error-state">
      <p>Impossible de charger cette page pour le moment.</p>
      <button type="button" onClick={reset}>
        Réessayer
      </button>
    </div>
  );
}
