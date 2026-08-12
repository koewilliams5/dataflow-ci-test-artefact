import { dashboardRepository } from "@dataflow-ci/database";
import { buildDailyStatusSeries } from "../../../lib/dashboard/buildDailyStatusSeries";
import { DailyIngestionsChart } from "./DailyIngestionsChart";
import { PeriodSelector } from "./PeriodSelector";
import { StatusDonutChart } from "./StatusDonutChart";
import { TopSourcesChart } from "./TopSourcesChart";

// Voir ASSUMPTIONS.md §7 : 30 jours glissants par défaut, sélecteur 7/30/90.
const WINDOW_OPTIONS = [7, 30, 90] as const;
const DEFAULT_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DashboardPageProps {
  searchParams: Promise<{ days?: string }>;
}

function resolveWindowDays(raw: string | undefined): number {
  const parsed = Number(raw);
  return (WINDOW_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_WINDOW_DAYS;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { days } = await searchParams;
  const windowDays = resolveWindowDays(days);

  const until = new Date();
  const since = new Date(until.getTime() - windowDays * MS_PER_DAY);

  const [summary, dailyRows, topSources] = await Promise.all([
    dashboardRepository.getDashboardSummary(since),
    dashboardRepository.getDailyStatusCounts(since),
    dashboardRepository.getTopSourcesByVolume(since),
  ]);

  const dailySeries = buildDailyStatusSeries(dailyRows, since, until);
  const successRate =
    summary.totalIngestions > 0
      ? Math.round((summary.successCount / summary.totalIngestions) * 100)
      : null;

  return (
    <section className="stack">
      <h1>Dashboard</h1>
      <PeriodSelector current={windowDays} options={WINDOW_OPTIONS} />

      <div className="stats-row">
        <div className="stat">
          <span className="stat-label">Fichiers ingérés</span>
          <span className="stat-value">{summary.totalIngestions}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Taux de succès</span>
          <span className="stat-value">{successRate !== null ? `${successRate}%` : "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">En cours</span>
          <span className="stat-value">{summary.inProgressCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Lignes traitées</span>
          <span className="stat-value">{summary.totalRowsProcessed}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Sources actives</span>
          <span className="stat-value">{summary.activeSourceCount}</span>
        </div>
      </div>

      {summary.totalIngestions === 0 ? (
        <p className="empty-state">Aucune ingestion sur les {windowDays} derniers jours.</p>
      ) : null}

      <div>
        <h2>Ingestions par jour</h2>
        <DailyIngestionsChart data={dailySeries} />
      </div>

      <div>
        <h2>Répartition par statut</h2>
        <StatusDonutChart
          success={summary.successCount}
          partial={summary.partialCount}
          failed={summary.failedCount}
          inProgress={summary.inProgressCount}
        />
      </div>

      <div>
        <h2>Sources les plus actives</h2>
        {topSources.length === 0 ? (
          <p className="empty-state">Aucune source active sur cette période.</p>
        ) : (
          <TopSourcesChart data={topSources} />
        )}
      </div>
    </section>
  );
}
