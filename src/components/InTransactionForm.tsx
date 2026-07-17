"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Source = "AI" | "SMT";

type Row = {
  id: number;
  noSlip: string;
  qty: number;
  toLocation: string;
  catatan: string | null;
  trxAt: string;
  part: { partNo: string; partName: string };
  picUser: { name: string; nik: string } | null;
};

export function InTransactionForm({
  source,
  title,
  defaultPic,
}: {
  source: Source;
  title: string;
  defaultPic: string;
}) {
  const [noSlip, setNoSlip] = useState("");
  const [partNo, setPartNo] = useState("");
  const [partName, setPartName] = useState("");
  const [qty, setQty] = useState("");
  const [toLocation, setToLocation] = useState("WC02");
  const [catatan, setCatatan] = useState("");
  const [pic, setPic] = useState(defaultPic);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filterPart, setFilterPart] = useState("");
  const [filterDate, setFilterDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [busy, setBusy] = useState(false);
  const slipRef = useRef<HTMLInputElement>(null);

  const totalQty = useMemo(
    () => rows.reduce((a, r) => a + Number(r.qty), 0),
    [rows]
  );

  const loadRows = useCallback(async () => {
    const qs = new URLSearchParams({
      source,
      date: filterDate,
      ...(filterPart ? { partNo: filterPart } : {}),
    });
    const res = await fetch(`/api/mi-in?${qs}`);
    const data = await res.json();
    if (res.ok) setRows(data);
  }, [source, filterDate, filterPart]);

  useEffect(() => {
    loadRows();
    slipRef.current?.focus();
  }, [loadRows]);

  async function lookupPart(pn: string) {
    if (!pn.trim()) {
      setPartName("");
      return;
    }
    const res = await fetch(`/api/parts?partNo=${encodeURIComponent(pn.trim())}`);
    const data = await res.json();
    if (res.ok) {
      setPartName(data.partName);
      setErr(null);
    } else {
      setPartName("");
      setErr(data.error || "Part tidak ditemukan");
    }
  }

  function clearForm(keepPic = true) {
    setNoSlip("");
    setPartNo("");
    setPartName("");
    setQty("");
    setToLocation("WC02");
    setCatatan("");
    if (!keepPic) setPic(defaultPic);
    slipRef.current?.focus();
  }

  async function simpan() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/mi-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          noSlip,
          partNo,
          qty: Number(qty),
          toLocation,
          catatan,
          picNik: pic,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Gagal simpan");
        return;
      }
      setMsg(`Tersimpan: ${noSlip}`);
      clearForm(true);
      await loadRows();
    } finally {
      setBusy(false);
    }
  }

  async function voidLast() {
    if (!confirm("Hapus (void) 1 data terakhir?")) return;
    const res = await fetch(`/api/mi-in?source=${source}&last=1`);
    const last = await res.json();
    if (!last?.id) {
      setErr("Tidak ada data untuk dihapus");
      return;
    }
    const v = await fetch(`/api/mi-in/${last.id}/void`, { method: "POST" });
    const data = await v.json();
    if (!v.ok) {
      setErr(data.error || "Gagal void");
      return;
    }
    setMsg("1 data terakhir di-void");
    await loadRows();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <span className="mt-1 inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs text-white">
            {source}
          </span>
        </div>
        <div className="text-sm text-zinc-600">PIC default: {defaultPic}</div>
      </div>

      <section className="grid gap-3 rounded-lg border border-zinc-300 bg-white p-4 md:grid-cols-2">
        <label className="block text-sm">
          No SLIP
          <input
            ref={slipRef}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-base"
            value={noSlip}
            onChange={(e) => setNoSlip(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("partNoIn")?.focus();
              }
            }}
          />
        </label>
        <label className="block text-sm">
          Part No
          <input
            id="partNoIn"
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-base"
            value={partNo}
            onChange={(e) => setPartNo(e.target.value.toUpperCase())}
            onBlur={() => lookupPart(partNo)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookupPart(partNo).then(() =>
                  document.getElementById("qtyIn")?.focus()
                );
              }
            }}
          />
        </label>
        <label className="block text-sm md:col-span-2">
          Part Name
          <input
            className="mt-1 w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2"
            value={partName}
            readOnly
          />
        </label>
        <label className="block text-sm">
          Qty OUT
          <input
            id="qtyIn"
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-base"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm">
          To Location
          <select
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
            value={toLocation}
            onChange={(e) => setToLocation(e.target.value)}
          >
            <option value="WC02">WC02</option>
          </select>
        </label>
        <label className="block text-sm">
          Catatan
          <input
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Input PIC (NIK)
          <input
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
            value={pic}
            onChange={(e) => setPic(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 md:col-span-2">
          <button
            type="button"
            disabled={busy}
            onClick={simpan}
            className="rounded bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Simpan
          </button>
          <button
            type="button"
            onClick={voidLast}
            className="rounded border border-zinc-400 bg-white px-4 py-2 hover:bg-zinc-50"
          >
            hapus 1 data terakhir
          </button>
          <button
            type="button"
            onClick={() => clearForm(true)}
            className="rounded border border-zinc-400 bg-white px-4 py-2 hover:bg-zinc-50"
          >
            ClearFORM
          </button>
          <button
            type="button"
            onClick={() =>
              setFilterDate(new Date().toISOString().slice(0, 10))
            }
            className="rounded border border-zinc-400 bg-white px-4 py-2 hover:bg-zinc-50"
          >
            Hari ini
          </button>
        </div>
        {err && <p className="text-sm text-red-700 md:col-span-2">{err}</p>}
        {msg && <p className="text-sm text-emerald-700 md:col-span-2">{msg}</p>}
      </section>

      <section className="rounded-lg border border-zinc-300 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Short by Part No
            <input
              className="mt-1 block rounded border border-zinc-300 px-2 py-1"
              value={filterPart}
              onChange={(e) => setFilterPart(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Tanggal
            <input
              type="date"
              className="mt-1 block rounded border border-zinc-300 px-2 py-1"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </label>
          <div className="text-sm font-medium">Total Qty: {totalQty}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                <th className="px-2 py-2">Tanggal</th>
                <th className="px-2 py-2">No Slip</th>
                <th className="px-2 py-2">Part No</th>
                <th className="px-2 py-2">Part Name</th>
                <th className="px-2 py-2">Qty OUT</th>
                <th className="px-2 py-2">PIC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(r.trxAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{r.noSlip}</td>
                  <td className="px-2 py-1.5 font-mono">{r.part.partNo}</td>
                  <td className="px-2 py-1.5">{r.part.partName}</td>
                  <td className="px-2 py-1.5">{r.qty}</td>
                  <td className="px-2 py-1.5">{r.picUser?.name}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-zinc-500">
                    Belum ada data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
