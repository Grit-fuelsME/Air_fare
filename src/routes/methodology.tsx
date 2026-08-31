import { createFileRoute, Link } from "@tanstack/react-router";

import { Panel } from "@/components/apix/ui";
import { getBacktest, ROUTES, WEIGHTS } from "@/lib/apix-data";

const TITLE = "Methodology — APIx Airfare Price Index";
const DESC =
  "How APIx weights Indian domestic routes by DGCA passenger traffic, samples T+1/T+15/T+30 advance-purchase windows, splits fare components, detects spikes and backtests against DGCA averages.";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => ({ backtest: getBacktest().summary }),
  component: Methodology,
});

function Methodology() {
  const { backtest } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link to="/" className="label-xs hover:text-foreground">
        ← Back to dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Methodology</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        APIx is built the way India's Consumer Price Index is built: a fixed basket, fixed weights
        derived from real consumption, and a transparent, reproducible calculation.
      </p>

      <div className="mt-6 grid gap-5">
        <Panel title="1. Passenger-traffic weighting">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Every route carries a weight equal to its share of domestic passenger traffic, taken
            from DGCA monthly traffic statistics and stored offline as{" "}
            <span className="num">route_weights.csv</span>. A fare move on Delhi–Mumbai therefore
            moves the index far more than the same move on Bengaluru–Hyderabad, because far more
            passengers actually pay it.
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="label-xs px-2 py-2 text-left">Route</th>
                <th className="label-xs px-2 py-2 text-left">Sector</th>
                <th className="label-xs px-2 py-2 text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {WEIGHTS.map((w) => (
                <tr key={w.route} className="border-b border-border/60">
                  <td className="num px-2 py-2">{w.route}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {ROUTES.find((r) => r.route === w.route)?.label}
                  </td>
                  <td className="num px-2 py-2 text-right">{(w.weight * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="2. Advance-purchase windows">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Airline pricing is dynamic, so a single quote is meaningless. Each route is sampled at
            three fixed booking windows — <strong>T+1</strong> (last minute), <strong>T+15</strong>{" "}
            and <strong>T+30</strong> — every day, across five carriers. Holding the window fixed
            makes day-to-day comparisons honest: we are always comparing like with like, and the
            T+1 premium becomes a demand-pressure signal in its own right.
          </p>
        </Panel>

        <Panel title="3. Fare-component breakdown">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Every observation stores base fare, taxes, User Development Fee (UDF) and convenience
            fee separately, with total fare as their sum. This matters for statistics users: a rise
            driven by airline base fares is an economic signal, while a rise driven by a UDF
            revision at an airport is an administered-price change and can be excluded or reported
            separately.
          </p>
        </Panel>

        <Panel title="4. Index formula and spike detection">
          <div className="num rounded-lg bg-surface-2 p-4 text-xs leading-relaxed">
            price_change%(route) = (fare_today − fare_yesterday) / fare_yesterday
            <br />
            weighted_change = Σ price_change%(route) × weight(route)
            <br />
            index(t) = index(t−1) × (1 + weighted_change), index(0) = 100
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Any route whose daily change exceeds +20% is flagged as a spike, marked red on the
            index chart and named in the auto-generated explanation sentence. The production
            pipeline uses the same threshold alongside a scikit-learn z-score / isolation-forest
            detector for seasonally adjusted outliers.
          </p>
        </Panel>

        <Panel title="5. Backtest against DGCA">
          <p className="text-sm leading-relaxed text-muted-foreground">{backtest.text}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Deviation is expected and healthy: DGCA publishes a monthly survey average, while APIx
            is a daily fixed-window panel. The backtest exists to prove the two move together, not
            to make them identical.
          </p>
        </Panel>

        <Panel title="6. Ethical data collection">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>robots.txt is fetched and honoured before any page is requested.</li>
            <li>A 1–2 second delay is enforced between requests; no parallel hammering.</li>
            <li>Failures degrade gracefully to the simulated panel rather than retrying hard.</li>
            <li>
              Production path: approved data-sharing APIs and partnerships with airlines, OTAs and
              DGCA — not scraping at scale.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
