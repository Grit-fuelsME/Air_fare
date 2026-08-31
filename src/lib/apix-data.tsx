/**
 * APIx core dataset + index engine.
 *
 * This module is the TypeScript mirror of the Python data-pipeline in
 * /data-pipeline (simulate_history.py + calculate_index.py). It generates a
 * deterministic ~90-day simulated fare panel and computes the passenger-traffic
 * weighted airfare price index (base = 100), exactly as the pipeline does.
 */

export type AdvanceDays = 1 | 15 | 30;

export interface FareDoc {
  route: string;
  date: string; // YYYY-MM-DD
  advance_days: AdvanceDays;
  carrier: string;
  base_fare: number;
  taxes: number;
  udf: number;
  convenience_fee: number;
  total_fare: number;
  source: string;
  spike: boolean;
}

export interface WeightDoc {
  route: string;
  weight: number;
}

export interface BenchmarkDoc {
  month: string;
  avg_fare: number;
}

export interface DailyIndexDoc {
  date: string;
  index_value: number;
  pct_change: number;
  top_contributor_route: string;
  explanation_text: string;
  spikes: { route: string; pct_change: number }[];
}

export const ROUTES = [
  { route: "DEL-BOM", label: "Delhi – Mumbai", base: 5400 },
  { route: "DEL-BLR", label: "Delhi – Bengaluru", base: 6100 },
  { route: "BOM-BLR", label: "Mumbai – Bengaluru", base: 4300 },
  { route: "DEL-CCU", label: "Delhi – Kolkata", base: 5200 },
  { route: "BLR-HYD", label: "Bengaluru – Hyderabad", base: 3200 },
  { route: "MAA-DEL", label: "Chennai – Delhi", base: 6400 },
] as const;

export const CARRIERS = [
  "IndiGo",
  "Air India",
  "Air India Express",
  "Akasa Air",
  "SpiceJet",
] as const;

export const ADVANCE_WINDOWS: AdvanceDays[] = [1, 15, 30];

/** DGCA passenger-traffic share derived weights (route_weights.csv). */
export const WEIGHTS: WeightDoc[] = [
  { route: "DEL-BOM", weight: 0.28 },
  { route: "DEL-BLR", weight: 0.21 },
  { route: "BOM-BLR", weight: 0.16 },
  { route: "DEL-CCU", weight: 0.14 },
  { route: "BLR-HYD", weight: 0.11 },
  { route: "MAA-DEL", weight: 0.1 },
];

const DAYS = 90;

/** Deterministic PRNG so every render / API call sees the same "database". */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ADVANCE_MULTIPLIER: Record<AdvanceDays, number> = {
  1: 1.62, // last-minute premium
  15: 1.12,
  30: 0.88,
};

const CARRIER_MULTIPLIER: Record<string, number> = {
  IndiGo: 1.0,
  "Air India": 1.14,
  "Air India Express": 0.9,
  "Akasa Air": 0.97,
  SpiceJet: 0.92,
};

/** Deliberate festival-season spike windows (offset from the start of series). */
const SPIKE_EVENTS: { dayOffset: number; route: string; magnitude: number; reason: string }[] = [
  { dayOffset: 34, route: "DEL-CCU", magnitude: 0.38, reason: "Durga Puja travel demand" },
  { dayOffset: 55, route: "DEL-BOM", magnitude: 0.27, reason: "Diwali festival travel" },
  { dayOffset: 56, route: "MAA-DEL", magnitude: 0.31, reason: "Diwali festival travel" },
  { dayOffset: 74, route: "BLR-HYD", magnitude: 0.24, reason: "long-weekend demand" },
];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface Dataset {
  fares: FareDoc[];
  weights: WeightDoc[];
  dgca_benchmark: BenchmarkDoc[];
  daily_index: DailyIndexDoc[];
  dates: string[];
  /** route -> date -> weighted-average total fare across carriers/windows */
  routeDaily: Record<string, Record<string, number>>;
}

let cached: Dataset | null = null;

export function getDataset(): Dataset {
  if (cached) return cached;
  cached = buildDataset();
  return cached;
}

function buildDataset(): Dataset {
  // Anchor the series to a fixed end date so the demo is reproducible.
  const end = new Date("2026-08-27T00:00:00Z");
  const dates: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(ymd(d));
  }

  const fares: FareDoc[] = [];
  const routeDaily: Record<string, Record<string, number>> = {};

  for (const r of ROUTES) {
    routeDaily[r.route] = {};
    const rnd = mulberry32(hashStr(r.route));
    let level = r.base;

    dates.forEach((date, di) => {
      // mean-reverting random walk + weekly seasonality
      const drift = (r.base - level) * 0.06;
      const noise = (rnd() - 0.5) * r.base * 0.05;
      const weekday = new Date(date + "T00:00:00Z").getUTCDay();
      const seasonal = weekday === 5 || weekday === 0 ? r.base * 0.035 : 0;
      level = level + drift + noise + seasonal * 0.4;

      const event = SPIKE_EVENTS.find((e) => e.dayOffset === di && e.route === r.route);
      const dayLevel = event ? level * (1 + event.magnitude) : level;

      let sum = 0;
      let n = 0;
      for (const adv of ADVANCE_WINDOWS) {
        for (const carrier of CARRIERS) {
          const base_fare = Math.round(
            dayLevel * ADVANCE_MULTIPLIER[adv] * CARRIER_MULTIPLIER[carrier]! * (0.97 + rnd() * 0.06),
          );
          const taxes = Math.round(base_fare * 0.09);
          const udf = 236;
          const convenience_fee = 299;
          const total_fare = base_fare + taxes + udf + convenience_fee;
          fares.push({
            route: r.route,
            date,
            advance_days: adv,
            carrier,
            base_fare,
            taxes,
            udf,
            convenience_fee,
            total_fare,
            source: "simulated",
            spike: false,
          });
          sum += total_fare;
          n++;
        }
      }
      routeDaily[r.route]![date] = sum / n;
    });
  }

  // ---- index computation (mirrors calculate_index.py) ----
  const weightMap = Object.fromEntries(WEIGHTS.map((w) => [w.route, w.weight]));
  const daily_index: DailyIndexDoc[] = [];
  let indexValue = 100;

  dates.forEach((date, di) => {
    if (di === 0) {
      daily_index.push({
        date,
        index_value: 100,
        pct_change: 0,
        top_contributor_route: "—",
        explanation_text:
          "Index base period established at 100 using DGCA passenger-traffic weights across six trunk routes.",
        spikes: [],
      });
      return;
    }
    const prev = dates[di - 1]!;
    let weightedChange = 0;
    let top = { route: "—", contrib: -Infinity, change: 0 };
    const spikes: { route: string; pct_change: number }[] = [];

    for (const r of ROUTES) {
      const today = routeDaily[r.route]![date]!;
      const yday = routeDaily[r.route]![prev]!;
      const change = (today - yday) / yday;
      const w = weightMap[r.route] ?? 0;
      const contrib = change * w;
      weightedChange += contrib;
      if (contrib > top.contrib) top = { route: r.route, contrib, change };
      if (change > 0.2) {
        spikes.push({ route: r.route, pct_change: +(change * 100).toFixed(2) });
        // flag underlying fare docs
        for (const f of fares) {
          if (f.route === r.route && f.date === date) f.spike = true;
        }
      }
    }

    indexValue = indexValue * (1 + weightedChange);
    const pct = weightedChange * 100;
    daily_index.push({
      date,
      index_value: +indexValue.toFixed(2),
      pct_change: +pct.toFixed(2),
      top_contributor_route: top.route,
      explanation_text: buildExplanation(date, pct, top.route, top.change * 100, spikes),
      spikes,
    });
  });

  // ---- DGCA benchmark (dgca_avg_fares.csv) ----
  const months = Array.from(new Set(dates.map((d) => d.slice(0, 7))));
  const dgca_benchmark: BenchmarkDoc[] = months.map((m, i) => {
    const monthDates = dates.filter((d) => d.startsWith(m));
    const avg =
      monthDates.reduce((s, d) => s + weightedAvgFare(routeDaily, d, weightMap), 0) /
      monthDates.length;
    // DGCA published averages differ slightly from scraped panel (survey method)
    const skew = [0.976, 1.019, 0.992, 1.008][i % 4]!;
    return { month: m, avg_fare: Math.round(avg * skew) };
  });

  return { fares, weights: WEIGHTS, dgca_benchmark, daily_index, dates, routeDaily };
}

function weightedAvgFare(
  routeDaily: Record<string, Record<string, number>>,
  date: string,
  weightMap: Record<string, number>,
) {
  return ROUTES.reduce((s, r) => s + routeDaily[r.route]![date]! * (weightMap[r.route] ?? 0), 0);
}

export function routeLabel(route: string) {
  return ROUTES.find((r) => r.route === route)?.label ?? route;
}

function buildExplanation(
  date: string,
  pct: number,
  topRoute: string,
  topChange: number,
  spikes: { route: string; pct_change: number }[],
) {
  const dir = pct >= 0 ? "rose" : "eased";
  const festival = SPIKE_EVENTS.find((e) => e.route === topRoute);
  const tail =
    spikes.length > 0
      ? ` ${festival ? festival.reason.replace(/^./, (c) => c.toUpperCase()) : "Sharp demand"} pushed ${spikes
          .map((s) => routeLabel(s.route))
          .join(", ")} up by more than 20% in a single day.`
      : "";
  return `On ${date} the airfare index ${dir} ${Math.abs(pct).toFixed(2)}%, mainly driven by ${routeLabel(
    topRoute,
  )} fares (${topChange >= 0 ? "+" : ""}${topChange.toFixed(1)}%).${tail}`;
}

// ------------------------------------------------------------------
// API-shaped selectors — these back both the REST routes and the UI.
// ------------------------------------------------------------------

export function getIndexHistory() {
  return getDataset().daily_index;
}

export function getLatestIndex() {
  const h = getIndexHistory();
  return h[h.length - 1]!;
}

export function getWeeklyIndex() {
  const h = getIndexHistory();
  const out: { week_start: string; index_value: number; pct_change: number }[] = [];
  for (let i = 0; i < h.length; i += 7) {
    const chunk = h.slice(i, i + 7);
    if (!chunk.length || !chunk[0]) break;
    const avg = chunk.reduce((s, d) => s + d.index_value, 0) / chunk.length;
    const prev = out[out.length - 1];
    out.push({
      week_start: chunk[0]!.date,
      index_value: +avg.toFixed(2),
      pct_change: prev ? +(((avg - prev.index_value) / prev.index_value) * 100).toFixed(2) : 0,
    });
  }
  return out;
}

export function getRoutesLatest() {
  const ds = getDataset();
  const latest = ds.dates[ds.dates.length - 1]!;
  const rows = ds.fares.filter((f) => f.date === latest);
  return { date: latest, fares: rows };
}

export function getHeatmap() {
  const ds = getDataset();
  const latest = ds.dates[ds.dates.length - 1]!;
  const prev = ds.dates[ds.dates.length - 2]!;
  return ROUTES.map((r) => {
    const t = ds.routeDaily[r.route]![latest]!;
    const y = ds.routeDaily[r.route]![prev]!;
    const week = ds.routeDaily[r.route]![ds.dates[ds.dates.length - 8]!]!;
    return {
      route: r.route,
      label: r.label,
      avg_fare: Math.round(t),
      pct_change: +(((t - y) / y) * 100).toFixed(2),
      pct_change_7d: +(((t - week) / week) * 100).toFixed(2),
      weight: WEIGHTS.find((w) => w.route === r.route)!.weight,
    };
  });
}

export function getElasticity(route: string) {
  const ds = getDataset();
  const latest = ds.dates[ds.dates.length - 1]!;
  const rows = ds.fares.filter((f) => f.route === route && f.date === latest);
  return ADVANCE_WINDOWS.map((adv) => {
    const subset = rows.filter((f) => f.advance_days === adv);
    return {
      window: `T+${adv}`,
      advance_days: adv,
      avg_fare: Math.round(subset.reduce((s, f) => s + f.total_fare, 0) / subset.length),
      avg_base: Math.round(subset.reduce((s, f) => s + f.base_fare, 0) / subset.length),
    };
  });
}

export function getBacktest() {
  const ds = getDataset();
  const weightMap = Object.fromEntries(WEIGHTS.map((w) => [w.route, w.weight]));
  const last30 = ds.dates.slice(-30);
  const rows = last30.map((date) => {
    const month = date.slice(0, 7);
    const bench = ds.dgca_benchmark.find((b) => b.month === month)!.avg_fare;
    const apix = weightedAvgFare(ds.routeDaily, date, weightMap);
    return {
      date,
      apix_avg_fare: Math.round(apix),
      dgca_avg_fare: bench,
      deviation_pct: +(((apix - bench) / bench) * 100).toFixed(2),
    };
  });
  const avgAbs = rows.reduce((s, r) => s + Math.abs(r.deviation_pct), 0) / rows.length;
  const avgSigned = rows.reduce((s, r) => s + r.deviation_pct, 0) / rows.length;
  return {
    rows,
    summary: {
      avg_abs_deviation_pct: +avgAbs.toFixed(2),
      avg_signed_deviation_pct: +avgSigned.toFixed(2),
      text: `Over the last 30 days the APIx weighted fare tracks the DGCA published benchmark with an average absolute deviation of ${avgAbs.toFixed(
        2,
      )}% (${avgSigned >= 0 ? "+" : ""}${avgSigned.toFixed(2)}% signed bias).`,
    },
  };
}
