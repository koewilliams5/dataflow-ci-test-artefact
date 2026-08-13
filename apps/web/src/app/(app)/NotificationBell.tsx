"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface NotificationItem {
  id: string;
  originalFilename: string;
  status: string;
  dataSourceName: string;
  processingCompletedAt: string | null;
}

const STORAGE_KEY_LAST_SEEN = "dataflow-notifications-last-seen";
const STORAGE_KEY_DISMISSED_IDS = "dataflow-notifications-dismissed-ids";
// Voir ADR-009 : polling, pas de SSE/WebSocket dans ce MVP — même pattern
// que le rapport d'ingestion, à l'échelle du header plutôt que d'une page.
const POLL_INTERVAL_MS = 5000;
// Borne la taille du set persisté en localStorage — alignée sur NOTIFICATION_LIMIT
// côté serveur (ingestionRepository.listIngestionsCompletedSince).
const DISMISSED_ID_LIMIT = 50;

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "Succès",
  PARTIAL: "Partiel",
  FAILED: "Échec",
};

function loadLastSeen(): string {
  if (typeof window === "undefined") return new Date().toISOString();
  return localStorage.getItem(STORAGE_KEY_LAST_SEEN) ?? new Date().toISOString();
}

function loadDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DISMISSED_IDS);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function persistDismissedIds(ids: Set<string>): void {
  localStorage.setItem(
    STORAGE_KEY_DISMISSED_IDS,
    JSON.stringify(Array.from(ids).slice(-DISMISSED_ID_LIMIT)),
  );
}

/**
 * Cloche de notifications in-app : signale les ingestions passées à un
 * statut terminal depuis la dernière consultation, sans avoir à rester sur
 * la page du rapport. Pas de notion de destinataire par notification —
 * l'app est mono-espace de travail (voir ASSUMPTIONS.md §1), cohérent avec
 * le dashboard qui montre déjà l'activité de tous les opérateurs.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadDismissedIds());
  const lastSeenRef = useRef<string>("");
  if (lastSeenRef.current === "") {
    lastSeenRef.current = loadLastSeen();
  }

  const visibleItems = items.filter((item) => !dismissedIds.has(item.id));

  useEffect(() => {
    async function poll() {
      const response = await fetch(
        `/api/notifications?since=${encodeURIComponent(lastSeenRef.current)}`,
        { cache: "no-store" },
      );
      if (response.ok) {
        const body = (await response.json()) as { items: NotificationItem[] };
        setItems(body.items);
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  function markAllSeen() {
    const now = new Date().toISOString();
    lastSeenRef.current = now;
    localStorage.setItem(STORAGE_KEY_LAST_SEEN, now);
    setItems([]);
    setDismissedIds(new Set());
    localStorage.removeItem(STORAGE_KEY_DISMISSED_IDS);
  }

  function markOneSeen(id: string) {
    setDismissedIds((current) => {
      const next = new Set(current).add(id);
      persistDismissedIds(next);
      return next;
    });
  }

  function closeDropdown() {
    markAllSeen();
    setIsOpen(false);
  }

  function handleToggle() {
    if (isOpen) {
      closeDropdown();
    } else {
      setIsOpen(true);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        onClick={handleToggle}
        aria-label={`Notifications${visibleItems.length > 0 ? ` (${visibleItems.length} nouvelle${visibleItems.length > 1 ? "s" : ""})` : ""}`}
        style={{ position: "relative" }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {visibleItems.length > 0 && !isOpen ? (
          <span className="notification-badge">{visibleItems.length}</span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="notification-dropdown">
          {visibleItems.length === 0 ? (
            <p className="empty-state" style={{ padding: "var(--space-3)" }}>
              Aucune nouvelle notification.
            </p>
          ) : (
            visibleItems.map((item) => (
              <Link
                key={item.id}
                href={`/ingestions/${item.id}`}
                className="notification-item"
                onClick={() => {
                  markOneSeen(item.id);
                  setIsOpen(false);
                }}
              >
                <p className="text-sm" style={{ fontWeight: "var(--weight-medium)" }}>
                  {item.originalFilename}
                </p>
                <p className="text-xs muted">
                  {item.dataSourceName} · {STATUS_LABELS[item.status] ?? item.status}
                </p>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
