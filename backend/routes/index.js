/**
 * APIx REST API router (reference Express implementation).
 *
 *   GET /api/index              full daily index history
 *   GET /api/index/latest       latest index value + % change + explanation
 *   GET /api/index/weekly       weekly aggregated, CPI-ready series
 *   GET /api/routes             per-route latest fares by advance window
 *   GET /api/heatmap            latest % price change per route
 *   GET /api/backtest           index vs DGCA benchmark
 *   GET /api/elasticity/:route  fare by advance-purchase window
 *   GET /api/weights            DGCA passenger-traffic weights
 */
const express = require("express");

const { DailyIndex, DgcaBenchmark, Fare, Weight } = require("../models/index");

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/index",
  asyncHandler(async (_req, res) => {
    res.json(await DailyIndex.find().sort({ date: 1 }).lean());
  }),
);

router.get(
  "/index/latest",
  asyncHandler(async (_req, res) => {
    const latest = await DailyIndex.findOne().sort({ date: -1 }).lean();
    if (!latest) return res.status(404).json({ error: "No index computed yet" });
    res.json(latest);
  }),
);

router.get(
  "/index/weekly",
  asyncHandler(async (_req, res) => {
    const days = await DailyIndex.find().sort({ date: 1 }).lean();
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const last = chunk[chunk.length - 1];
      const prev = weeks[weeks.length - 1];
      weeks.push({
        week_start: chunk[0].date.toISOString().slice(0, 10),
        index_value: Number(last.index_value.toFixed(2)),
        pct_change: prev
          ? Number((((last.index_value - prev.index_value) / prev.index_value) * 100).toFixed(2))
          : 0,
      });
    }
    res.json({
      note: "CPI-ready series: weekly weighted airfare price index for NSO / RBI consumption.",
      base: "First week of series = 100",
      series: weeks,
    });
  }),
);

const latestFareDate = async () => {
  const last = await Fare.findOne().sort({ date: -1 }).lean();
  return last ? last.date : null;
};

router.get(
  "/routes",
  asyncHandler(async (_req, res) => {
    const date = await latestFareDate();
    if (!date) return res.json({ date: null, fares: [] });
    const fares = await Fare.find({ date }).lean();
    res.json({ date: date.toISOString().slice(0, 10), fares });
  }),
);

router.get(
  "/weights",
  asyncHandler(async (_req, res) => {
    res.json(await Weight.find().sort({ weight: -1 }).lean());
  }),
);

router.get(
  "/heatmap",
  asyncHandler(async (_req, res) => {
    const days = await DailyIndex.find().sort({ date: -1 }).limit(2).lean();
    const [today, yesterday] = days;
    if (!today || !yesterday) return res.json([]);

    const avg = async (date) => {
      const rows = await Fare.aggregate([
        { $match: { date } },
        { $group: { _id: "$route", fare: { $avg: "$total_fare" } } },
      ]);
      return Object.fromEntries(rows.map((r) => [r._id, r.fare]));
    };

    const [a, b] = await Promise.all([avg(today.date), avg(yesterday.date)]);
    res.json(
      Object.keys(a).map((route) => ({
        route,
        fare: Math.round(a[route]),
        pct_change: b[route] ? Number((((a[route] - b[route]) / b[route]) * 100).toFixed(2)) : 0,
      })),
    );
  }),
);

router.get(
  "/backtest",
  asyncHandler(async (_req, res) => {
    const [benchmarks, days] = await Promise.all([
      DgcaBenchmark.find().sort({ month: 1 }).lean(),
      DailyIndex.find().sort({ date: 1 }).lean(),
    ]);

    const byMonth = new Map();
    for (const d of days) {
      const key = d.date.toISOString().slice(0, 7);
      const bucket = byMonth.get(key) ?? [];
      bucket.push(d.index_value);
      byMonth.set(key, bucket);
    }

    const first = benchmarks[0];
    const points = benchmarks
      .filter((b) => byMonth.has(b.month))
      .map((b) => {
        const values = byMonth.get(b.month);
        const apix = values.reduce((s, v) => s + v, 0) / values.length;
        const dgca = (b.avg_fare / first.avg_fare) * 100;
        return {
          month: b.month,
          apix_index: Number(apix.toFixed(2)),
          dgca_index: Number(dgca.toFixed(2)),
          deviation_pct: Number((((apix - dgca) / dgca) * 100).toFixed(2)),
        };
      });

    const avgAbs = points.length
      ? points.reduce((s, p) => s + Math.abs(p.deviation_pct), 0) / points.length
      : 0;

    res.json({
      points,
      summary: {
        months_compared: points.length,
        avg_abs_deviation_pct: Number(avgAbs.toFixed(2)),
        verdict: avgAbs < 5 ? "Tracks DGCA closely" : "Diverges from DGCA benchmark",
      },
    });
  }),
);

router.get(
  "/elasticity/:route",
  asyncHandler(async (req, res) => {
    const date = await latestFareDate();
    if (!date) return res.json({ route: req.params.route, windows: [] });
    const rows = await Fare.aggregate([
      { $match: { date, route: req.params.route } },
      { $group: { _id: "$advance_days", fare: { $avg: "$total_fare" } } },
      { $sort: { _id: 1 } },
    ]);
    res.json({
      route: req.params.route,
      windows: rows.map((r) => ({ advance_days: r._id, fare: Math.round(r.fare) })),
    });
  }),
);

router.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

module.exports = router;
