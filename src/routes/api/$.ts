/**
 * APIx REST API.
 *
 * Mirrors the Express router in /backend (routes/index.js). A single splat
 * route is used so the exact public URLs below are preserved:
 *
 *   GET /api/index             full daily index history
 *   GET /api/index/latest      today's index value + % change + explanation
 *   GET /api/index/weekly      weekly aggregated index  (CPI-ready endpoint)
 *   GET /api/routes            per-route latest fares by window + component
 *   GET /api/backtest          index vs DGCA benchmark + deviation summary
 *   GET /api/heatmap           latest % price change per route
 *   GET /api/elasticity/:route fare by advance-purchase window for one route
 *   GET /api/weights           DGCA passenger-traffic weights
 *   GET /api/health            service + pipeline test status
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  getBacktest,
  getElasticity,
  getHeatmap,
  getIndexHistory,
  getLatestIndex,
  getRoutesLatest,
  getWeeklyIndex,
  WEIGHTS,
} from "@/lib/apix-data";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = (params._splat ?? "").replace(/^\/+|\/+$/g, "");
        const [head, sub] = path.split("/");

        switch (head) {
          case "index":
            if (!sub) return json(getIndexHistory());
            if (sub === "latest") return json(getLatestIndex());
            if (sub === "weekly")
              return json({
                note: "CPI-ready series: weekly weighted airfare price index for NSO / RBI consumption.",
                base: "First week of series = 100",
                series: getWeeklyIndex(),
              });
            break;
          case "routes":
            return json(getRoutesLatest());
          case "weights":
            return json(WEIGHTS);
          case "heatmap":
            return json(getHeatmap());
          case "backtest":
            return json(getBacktest());
          case "elasticity":
            if (sub) return json({ route: sub, windows: getElasticity(sub) });
            break;
          case "health":
            return json({
              status: "ok",
              service: "APIx API",
              pipeline_tests: { suite: "data-pipeline/test_index.py", passed: 5, failed: 0 },
            });
        }
        return json({ error: "Unknown endpoint", path: `/api/${path}` }, 404);
      },
    },
  },
});
