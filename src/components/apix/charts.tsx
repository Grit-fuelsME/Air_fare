import { useState } from "react";
import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Legend,
} from "recharts";

import type { DailyIndexDoc } from "@/lib/apix-data";
import { getElasticity, routeLabel, ROUTES } from "@/lib/apix-data";
import { Delta, inr, Panel, Select } from "./ui";

const axis = { stroke: "var(--color-muted-foreground)", fontSize: 11 };

function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel num px-3 py-2 text-xs shadow-lg">{children}</div>
  );
}

export function IndexChart({ history }: { history: DailyIndexDoc[] }) {
  const data = history.map((d) => ({
    ...d,
    spikeValue: d.spikes.length ? d.index_value : null,
  }));

  return (
    <Panel
      title="APIx daily index"
      subtitle="Passenger-traffic weighted airfare index, base 100. Red markers = detected fare spikes (>20% single-day route move)."
    >
      <div className="h-[300px] w-full sm:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={axis}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              minTickGap={40}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              domain={[
                (min: number) => Math.floor(min - 2),
                (max: number) => Math.ceil(max + 2),
              ]}
              allowDecimals={false}
              width={50}
            />

            <Tooltip
              cursor={{ stroke: "var(--color-muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]!.payload as DailyIndexDoc;
                return (
                  <TooltipBox>
                    <div className="label-xs mb-1">{d.date}</div>
                    <div className="text-sm font-semibold">{d.index_value.toFixed(2)}</div>
                    <div className="mt-1">
                      <Delta value={d.pct_change} />
                    </div>
                    {d.spikes.length > 0 && (
                      <div className="mt-2 max-w-[220px] text-down">
                        Spike:{" "}
                        {d.spikes
                          .map((s) => `${routeLabel(s.route)} +${s.pct_change}%`)
                          .join(", ")}
                      </div>
                    )}
                  </TooltipBox>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="index_value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-primary)" }}
            />
            <Line
              type="monotone"
              dataKey="spikeValue"
              stroke="transparent"
              legendType="none"
              isAnimationActive={false}
              dot={(props: any) =>
                props.value == null ? (
                  <Dot key={props.key} r={0} cx={0} cy={0} />
                ) : (
                  <Dot
                    key={props.key}
                    cx={props.cx}
                    cy={props.cy}
                    r={4.5}
                    fill="var(--color-down)"
                    stroke="var(--color-background)"
                    strokeWidth={1.5}
                  />
                )
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function ElasticityChart() {
  const [route, setRoute] = useState<string>(ROUTES[0].route);
  const data = getElasticity(route);

  return (
    <Panel
      title="Lead-time fare elasticity"
      subtitle="Average total fare by advance-purchase window on the latest observation date."
      right={
        <Select
          ariaLabel="Select route"
          value={route}
          onChange={setRoute}
          options={ROUTES.map((r) => ({ value: r.route, label: `${r.route} · ${r.label}` }))}
        />
      }
    >
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="window" tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => inr(v)} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]!.payload as { window: string; avg_fare: number; avg_base: number };
                return (
                  <TooltipBox>
                    <div className="label-xs mb-1">{d.window} booking window</div>
                    <div>Total fare {inr(d.avg_fare)}</div>
                    <div className="text-muted-foreground">Base fare {inr(d.avg_base)}</div>
                  </TooltipBox>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="avg_fare"
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "var(--color-accent)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Fares fall as the booking window widens — the T+1 premium is the clearest signal of demand
        pressure and is tracked separately so the index is not distorted by booking behaviour.
      </p>
    </Panel>
  );
}

export function BacktestPanel({
  backtest,
}: {
  backtest: {
    rows: { date: string; apix_avg_fare: number; dgca_avg_fare: number; deviation_pct: number }[];
    summary: { avg_abs_deviation_pct: number; avg_signed_deviation_pct: number; text: string };
  };
}) {
  return (
    <Panel
      title="Backtest vs DGCA benchmark"
      subtitle="APIx weighted average fare compared with DGCA published monthly average domestic fare, last 30 days."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={backtest.rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={axis}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
                minTickGap={30}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => inr(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "var(--color-surface-2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]!.payload as (typeof backtest.rows)[number];
                  return (
                    <TooltipBox>
                      <div className="label-xs mb-1">{d.date}</div>
                      <div>APIx {inr(d.apix_avg_fare)}</div>
                      <div>DGCA {inr(d.dgca_avg_fare)}</div>
                      <div className="mt-1">
                        <Delta value={d.deviation_pct} />
                      </div>
                    </TooltipBox>
                  );
                }}
              />
              <Bar name="APIx" dataKey="apix_avg_fare" fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
              <Bar name="DGCA" dataKey="dgca_avg_fare" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="label-xs">Avg absolute deviation</div>
            <div className="num mt-1 text-2xl font-semibold text-primary">
              {backtest.summary.avg_abs_deviation_pct}%
            </div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="label-xs">Signed bias</div>
            <div className="num mt-1 text-2xl font-semibold">
              {backtest.summary.avg_signed_deviation_pct > 0 ? "+" : ""}
              {backtest.summary.avg_signed_deviation_pct}%
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{backtest.summary.text}</p>
        </div>
      </div>
    </Panel>
  );
}
