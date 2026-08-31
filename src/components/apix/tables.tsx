import { useMemo, useState } from "react";

import type { FareDoc } from "@/lib/apix-data";
import { ADVANCE_WINDOWS, CARRIERS } from "@/lib/apix-data";
import { inr, Panel, Select } from "./ui";

export function Heatmap({
  rows,
}: {
  rows: {
    route: string;
    label: string;
    avg_fare: number;
    pct_change: number;
    pct_change_7d: number;
    weight: number;
  }[];
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.pct_change)), 1);
  return (
    <Panel
      title="Sector-wise price heatmap"
      subtitle="Latest day-on-day change in weighted average fare. Green = cheaper, red = costlier."
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const intensity = Math.min(Math.abs(r.pct_change) / max, 1) * 0.35 + 0.08;
          const up = r.pct_change >= 0;
          return (
            <div
              key={r.route}
              className="rounded-lg border border-border p-3"
              style={{
                backgroundColor: up
                  ? `color-mix(in oklab, var(--color-down) ${intensity * 100}%, var(--color-surface))`
                  : `color-mix(in oklab, var(--color-up) ${intensity * 100}%, var(--color-surface))`,
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="num text-sm font-semibold">{r.route}</span>
                <span className={`num text-sm font-semibold ${up ? "text-down" : "text-up"}`}>
                  {up ? "+" : ""}
                  {r.pct_change}%
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{r.label}</div>
              <div className="num mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>{inr(r.avg_fare)} avg</span>
                <span>7d {r.pct_change_7d > 0 ? "+" : ""}{r.pct_change_7d}%</span>
                <span>w {(r.weight * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function RoutesTable({ date, fares }: { date: string; fares: FareDoc[] }) {
  const [adv, setAdv] = useState("15");
  const [carrier, setCarrier] = useState("all");

  const rows = useMemo(
    () =>
      fares
        .filter((f) => String(f.advance_days) === adv)
        .filter((f) => carrier === "all" || f.carrier === carrier)
        .sort((a, b) => a.route.localeCompare(b.route) || a.carrier.localeCompare(b.carrier)),
    [fares, adv, carrier],
  );

  return (
    <Panel
      title="Route × carrier fare components"
      subtitle={`Latest observation ${date}. Total = base fare + taxes + UDF + convenience fee.`}
      right={
        <div className="flex gap-2">
          <Select
            ariaLabel="Advance purchase window"
            value={adv}
            onChange={setAdv}
            options={ADVANCE_WINDOWS.map((a) => ({ value: String(a), label: `T+${a}` }))}
          />
          <Select
            ariaLabel="Carrier"
            value={carrier}
            onChange={setCarrier}
            options={[
              { value: "all", label: "All carriers" },
              ...CARRIERS.map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>
      }
    >
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Route", "Carrier", "Base", "Taxes", "UDF", "Conv.", "Total"].map((h, i) => (
                <th
                  key={h}
                  className={`label-xs px-2 py-2 ${i > 1 ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr
                key={`${f.route}-${f.carrier}-${i}`}
                className="border-b border-border/60 hover:bg-surface-2"
              >
                <td className="num px-2 py-2 font-medium">
                  {f.route}
                  {f.spike && (
                    <span className="ml-2 rounded bg-down/20 px-1.5 py-0.5 text-[10px] text-down">
                      SPIKE
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-muted-foreground">{f.carrier}</td>
                <td className="num px-2 py-2 text-right">{inr(f.base_fare)}</td>
                <td className="num px-2 py-2 text-right text-muted-foreground">{inr(f.taxes)}</td>
                <td className="num px-2 py-2 text-right text-muted-foreground">{inr(f.udf)}</td>
                <td className="num px-2 py-2 text-right text-muted-foreground">
                  {inr(f.convenience_fee)}
                </td>
                <td className="num px-2 py-2 text-right font-semibold text-primary">
                  {inr(f.total_fare)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
