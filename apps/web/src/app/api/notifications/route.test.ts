import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listIngestionsCompletedSince = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  ingestionRepository: {
    listIngestionsCompletedSince: (...args: unknown[]) => listIngestionsCompletedSince(...args),
  },
}));

const requireSession = vi.fn();
vi.mock("../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const { GET } = await import("./route");

const AUTHENTICATED = {
  session: { user: { id: "user-1", email: "demo@dataflow-ci.com" } },
  response: null,
};

const UNAUTHENTICATED = {
  session: null,
  response: NextResponse.json({ error: { message: "Authentification requise." } }, { status: 401 }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/notifications", () => {
  it("401 si non authentifié", async () => {
    requireSession.mockResolvedValue(UNAUTHENTICATED);

    const response = await GET(new Request("http://localhost/api/notifications"));

    expect(response.status).toBe(401);
    expect(listIngestionsCompletedSince).not.toHaveBeenCalled();
  });

  it("200 et retourne les ingestions terminées depuis `since`", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    listIngestionsCompletedSince.mockResolvedValue([
      {
        id: "ingestion-1",
        originalFilename: "ventes.csv",
        status: "SUCCESS",
        dataSource: { name: "Ventes Orange CI" },
        processingCompletedAt: new Date("2026-08-12T10:00:00.000Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/notifications?since=2026-08-12T09:00:00.000Z"),
    );
    const body = (await response.json()) as { items: unknown[] };

    expect(response.status).toBe(200);
    expect(body.items).toEqual([
      {
        id: "ingestion-1",
        originalFilename: "ventes.csv",
        status: "SUCCESS",
        dataSourceName: "Ventes Orange CI",
        processingCompletedAt: "2026-08-12T10:00:00.000Z",
      },
    ]);
    expect(listIngestionsCompletedSince).toHaveBeenCalledWith(new Date("2026-08-12T09:00:00.000Z"));
  });

  it("retombe sur une fenêtre par défaut si `since` est absent ou invalide", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    listIngestionsCompletedSince.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/notifications?since=not-a-date"));

    expect(response.status).toBe(200);
    expect(listIngestionsCompletedSince).toHaveBeenCalledTimes(1);
    const [sinceArg] = listIngestionsCompletedSince.mock.calls[0] as [Date];
    expect(sinceArg).toBeInstanceOf(Date);
    expect(Number.isNaN(sinceArg.getTime())).toBe(false);
  });
});
