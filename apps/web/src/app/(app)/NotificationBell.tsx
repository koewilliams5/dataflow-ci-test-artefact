"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface NotificationItem {
  id: string;
  originalFilename: string;
  status: string;
  dataSourceName: string;
  processingCompletedAt: string | null;
}

const STORAGE_KEY_READ_IDS = "dataflow-notifications-read-ids";
// Voir ADR-009 : polling, pas de SSE/WebSocket dans ce MVP — même pattern
// que le rapport d'ingestion, à l'échelle du header plutôt que d'une page.
const POLL_INTERVAL_MS = 5000;
// Fenêtre d'historique affichée dans le menu — volontairement large (pas liée
// à la dernière consultation) pour que la distinction lu/non lu ait un sens :
// une notification lue reste visible, elle ne disparaît pas de la liste.
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Borne la taille du set persisté en localStorage — alignée sur NOTIFICATION_LIMIT
// côté serveur (ingestionRepository.listIngestionsCompletedSince).
const READ_ID_LIMIT = 50;

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "Succès",
  PARTIAL: "Partiel",
  FAILED: "Échec",
};

function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_READ_IDS);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>): void {
  localStorage.setItem(STORAGE_KEY_READ_IDS, JSON.stringify(Array.from(ids).slice(-READ_ID_LIMIT)));
}

/**
 * Cloche de notifications in-app : liste les ingestions passées à un statut
 * terminal récemment, sans avoir à rester sur la page du rapport. Les
 * notifications lues restent visibles (distinguées visuellement) plutôt que
 * de disparaître — seul le badge ne compte que les non lues. Pas de notion
 * de destinataire par notification — l'app est mono-espace de travail (voir
 * ASSUMPTIONS.md §1), cohérent avec le dashboard qui montre déjà l'activité
 * de tous les opérateurs.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const unreadCount = items.filter((item) => !readIds.has(item.id)).length;

  useEffect(() => {
    async function poll() {
      const since = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
      const response = await fetch(`/api/notifications?since=${encodeURIComponent(since)}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const body = (await response.json()) as { items: NotificationItem[] };
        setItems(body.items);
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Change de page (ex. clic sur un lien du menu principal) : le composant
  // ne se démonte pas entre deux pages (il fait partie du layout permanent),
  // donc sans ça le menu resterait ouvert par-dessus la nouvelle page.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Clic en dehors du menu : même fermeture.
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function markOneRead(id: string) {
    setReadIds((current) => {
      const next = new Set(current).add(id);
      persistReadIds(next);
      return next;
    });
  }

  function markAllRead() {
    setReadIds((current) => {
      const next = new Set(current);
      for (const item of items) next.add(item.id);
      persistReadIds(next);
      return next;
    });
  }

  function handleToggle() {
    if (isOpen) {
      markAllRead();
      setIsOpen(false);
    } else {
      setIsOpen(true);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lue${unreadCount > 1 ? "s" : ""})` : ""}`}
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
        {unreadCount > 0 && !isOpen ? <span className="notification-badge">{unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div className="notification-dropdown">
          {items.length === 0 ? (
            <p className="empty-state" style={{ padding: "var(--space-3)" }}>
              Aucune notification récente.
            </p>
          ) : (
            items.map((item) => {
              const isUnread = !readIds.has(item.id);
              return (
                <Link
                  key={item.id}
                  href={`/ingestions/${item.id}`}
                  className={`notification-item ${isUnread ? "notification-item--unread" : "notification-item--read"}`}
                  onClick={() => {
                    markOneRead(item.id);
                    setIsOpen(false);
                  }}
                >
                  {isUnread ? <span className="notification-item-dot" aria-hidden="true" /> : null}
                  <span className="notification-item-body">
                    <p className="text-sm" style={{ fontWeight: "var(--weight-medium)" }}>
                      {item.originalFilename}
                    </p>
                    <p className="text-xs muted">
                      {item.dataSourceName} · {STATUS_LABELS[item.status] ?? item.status}
                    </p>
                  </span>
                </Link>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
