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

const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

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
    <div className="page">
      <div className="page-header row-between row-wrap">
        <div>
          <h1 className="page-title">Vue d&apos;ensemble</h1>
          <p className="page-subtitle">Activité d&apos;ingestion et qualité des fichiers reçus</p>
        </div>
        <PeriodSelector current={windowDays} options={WINDOW_OPTIONS} />
      </div>

      <div className="stack-6">
        {summary.totalIngestions === 0 ? (
          <div className="empty-state-block">
            <span className="empty-state-icon">
              <svg {...ICON_PROPS} width={18} height={18}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
              </svg>
            </span>
            <p className="empty-state-title">Aucune ingestion sur cette période</p>
            <p className="empty-state-text">
              Choisis une période plus large ou dépose un fichier depuis la page Ingestions.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-kpi">
              <article className="kpi kpi-accent">
                <div className="kpi-head">
                  <span className="kpi-icon">
                    <svg {...ICON_PROPS}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </span>
                  <span className="kpi-label">Fichiers ingérés</span>
                </div>
                <span className="kpi-value">{summary.totalIngestions}</span>
                <span className="kpi-meta">Sur la période</span>
              </article>

              <article className="kpi kpi-success">
                <div className="kpi-head">
                  <span className="kpi-icon">
                    <svg {...ICON_PROPS}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <span className="kpi-label">Taux de succès</span>
                </div>
                <span className="kpi-value">
                  {successRate !== null ? successRate : "—"}
                  {successRate !== null ? <span className="kpi-unit">%</span> : null}
                </span>
                {successRate !== null ? (
                  <div className="kpi-bar">
                    <i style={{ width: `${successRate}%` }} />
                  </div>
                ) : null}
              </article>

              <article className="kpi kpi-processing">
                <div className="kpi-head">
                  <span className="kpi-icon">
                    <svg {...ICON_PROPS}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                  </span>
                  <span className="kpi-label">En cours</span>
                </div>
                <span className="kpi-value">{summary.inProgressCount}</span>
                <span className="kpi-meta">En attente ou en traitement</span>
              </article>

              <article className="kpi kpi-accent">
                <div className="kpi-head">
                  <span className="kpi-icon">
                    <svg {...ICON_PROPS}>
                      <path d="M3 5h18M3 12h18M3 19h18" />
                    </svg>
                  </span>
                  <span className="kpi-label">Lignes traitées</span>
                </div>
                <span className="kpi-value">{summary.totalRowsProcessed.toLocaleString("fr-FR")}</span>
                <span className="kpi-meta">Toutes ingestions confondues</span>
              </article>

              <article className="kpi kpi-accent">
                <div className="kpi-head">
                  <span className="kpi-icon">
                    <svg {...ICON_PROPS}>
                      <ellipse cx="12" cy="5" rx="8" ry="3" />
                      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
                      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
                    </svg>
                  </span>
                  <span className="kpi-label">Sources actives</span>
                </div>
                <span className="kpi-value">{summary.activeSourceCount}</span>
                <span className="kpi-meta">Ayant reçu au moins 1 fichier</span>
              </article>
            </div>

            <div className="grid grid-charts">
              <div className="chart-card">
                <div className="chart-header">
                  <div>
                    <p className="chart-title">Ingestions par jour</p>
                    <p className="chart-desc">Volume quotidien, empilé par statut</p>
                  </div>
                </div>
                <div className="chart-body">
                  <DailyIngestionsChart data={dailySeries} />
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-header">
                  <div>
                    <p className="chart-title">Répartition des statuts</p>
                    <p className="chart-desc">Part de chaque issue sur la période</p>
                  </div>
                </div>
                <div className="chart-body">
                  <StatusDonutChart
                    success={summary.successCount}
                    partial={summary.partialCount}
                    failed={summary.failedCount}
                    inProgress={summary.inProgressCount}
                  />
                </div>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <p className="chart-title">Sources les plus actives</p>
                  <p className="chart-desc">Nombre d&apos;ingestions par source</p>
                </div>
              </div>
              <div className="chart-body">
                {topSources.length === 0 ? (
                  <div className="empty-state-chart">
                    <span className="empty-state-icon">
                      <svg {...ICON_PROPS} width={18} height={18}>
                        <ellipse cx="12" cy="5" rx="8" ry="3" />
                        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
                      </svg>
                    </span>
                    <p className="empty-state-text">Aucune source active sur cette période.</p>
                  </div>
                ) : (
                  <TopSourcesChart data={topSources} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
