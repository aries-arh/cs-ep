"use client";

import { useEffect, useState } from "react";

type Summary = {
  asOf: string;
  date: string;
  threshold: number;
  kpi: {
    partActive: number;
    stockNegative: number;
    stockLow: number;
    qtyInToday: number;
    qtyOutToday: number;
    netToday: number;
  };
  stockByLine: {
    lineCode: string;
    partCount: number;
    totalStock: number;
    negativeCount: number;
    lowCount: number;
  }[];
  lowStock: {
    partNo: string;
    partName: string;
    lineCode: string | null;
    totalStock: number;
    status: string;
  }[];
  inOutToday: {
    qtyIn: number;
    qtyOut: number;
    inBySource: { source: string; qty: number }[];
  };
  topIssued: {
    rank: number;
    partNo?: string;
    partName?: string;
    lineCode?: string;
    qtyOut: number;
  }[];
};

export function DashboardClient() {
  const [data, setData] = useState<Summary | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [line, setLine] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const qs = new URLSearchParams({ date, ...(line ? { line } : {}) });
    const res = await fetch(`/api/dashboard/summary?${qs}`);
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Gagal load");
      return;
    }
    setErr(null);
    setData(json);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, line]);

  const maxLine = Math.max(...(data?.stockByLine.map((x) => x.totalStock) || [1]), 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard Stok WIP — CS EP1</h1>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded border px-2 py-1 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <select
            className="rounded border px-2 py-1 text-sm"
            value={line}
            onChange={(e) => setLine(e.target.value)}
          >
            <option value="">Semua Line</option>
            {(data?.stockByLine || []).map((l) => (
              <option key={l.lineCode} value={l.lineCode}>
                {l.lineCode}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            className="rounded border bg-white px-3 py-1 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <p className="text-red-700">{err}</p>}
      {!data ? (
        <p className="text-zinc-500">Memuat…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Part aktif", data.kpi.partActive],
              ["Stok negatif", data.kpi.stockNegative],
              ["Stok rendah", data.kpi.stockLow],
              ["Net hari ini", data.kpi.netToday],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-zinc-300 bg-white p-4"
              >
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  {label}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{val}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-zinc-300 bg-white p-4">
              <h2 className="mb-3 font-medium">Stok per Line</h2>
              <ul className="space-y-2">
                {data.stockByLine.map((l) => (
                  <li key={l.lineCode}>
                    <div className="mb-0.5 flex justify-between text-sm">
                      <span>{l.lineCode}</span>
                      <span className="tabular-nums">
                        {l.totalStock.toFixed(1)} ({l.partCount} part)
                      </span>
                    </div>
                    <div className="h-2 rounded bg-zinc-100">
                      <div
                        className="h-2 rounded bg-zinc-700"
                        style={{
                          width: `${Math.min(100, (Math.max(0, l.totalStock) / maxLine) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-zinc-300 bg-white p-4">
              <h2 className="mb-3 font-medium">IN vs OUT hari ini</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>IN</span>
                  <span className="tabular-nums font-medium">
                    {data.inOutToday.qtyIn}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>OUT</span>
                  <span className="tabular-nums font-medium">
                    {data.inOutToday.qtyOut}
                  </span>
                </div>
                <ul className="mt-3 border-t pt-2 text-zinc-600">
                  {data.inOutToday.inBySource.map((s) => (
                    <li key={s.source} className="flex justify-between">
                      <span>{s.source}</span>
                      <span>{s.qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-zinc-300 bg-white p-4">
              <h2 className="mb-3 font-medium">
                Part stok rendah / negatif (≤ {data.threshold})
              </h2>
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Part</th>
                      <th className="px-2 py-1">Line</th>
                      <th className="px-2 py-1">Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((r) => (
                      <tr key={r.partNo} className="border-t">
                        <td
                          className={`px-2 py-1 ${
                            r.status === "NEGATIVE" ? "text-red-700" : "text-amber-700"
                          }`}
                        >
                          {r.status}
                        </td>
                        <td className="px-2 py-1">
                          <div className="font-mono">{r.partNo}</div>
                          <div className="text-xs text-zinc-500">{r.partName}</div>
                        </td>
                        <td className="px-2 py-1">{r.lineCode}</td>
                        <td className="px-2 py-1 tabular-nums">{r.totalStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-300 bg-white p-4">
              <h2 className="mb-3 font-medium">Top part issue (OUT)</h2>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Part</th>
                    <th className="px-2 py-1">Qty OUT</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topIssued.map((r) => (
                    <tr key={r.rank} className="border-t">
                      <td className="px-2 py-1">{r.rank}</td>
                      <td className="px-2 py-1">
                        <div className="font-mono">{r.partNo}</div>
                        <div className="text-xs text-zinc-500">{r.partName}</div>
                      </td>
                      <td className="px-2 py-1 tabular-nums">{r.qtyOut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <p className="text-xs text-zinc-500">
            Auto-refresh 60 dtk · Terakhir: {new Date(data.asOf).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
