"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OutRow = {
  id: number;
  qty: number;
  trxAt: string;
  part: { partNo: string; partName: string };
  line: { code: string } | null;
  picUser: { name: string; nik: string } | null;
};

type InRow = {
  id: number;
  source: string;
  qty: number;
  trxAt: string;
  part: { partNo: string; partName: string };
};

function formatTitleDate(isoDate: string) {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return isoDate;
  return d
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .replace(/ /g, "-");
}

export function MiTransactionForm({ defaultPic }: { defaultPic: string }) {
  const [partNo, setPartNo] = useState("");
  const [partName, setPartName] = useState("");
  const [stok, setStok] = useState<number | null>(null);
  const [line, setLine] = useState("");
  const [qty, setQty] = useState("");
  const [pic, setPic] = useState(defaultPic);
  const [filterPart, setFilterPart] = useState("");
  const [filterDate, setFilterDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [outRows, setOutRows] = useState<OutRow[]>([]);
  const [inRows, setInRows] = useState<InRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const partRef = useRef<HTMLInputElement>(null);

  const threshold = 10;
  const stokClass =
    stok == null
      ? ""
      : stok < 0
        ? "text-red-700 font-semibold"
        : stok <= threshold
          ? "text-amber-700 font-semibold"
          : "text-emerald-800";

  const titleDate = formatTitleDate(filterDate);

  const loadGrids = useCallback(async () => {
    const qs = new URLSearchParams({
      date: filterDate,
      ...(filterPart ? { partNo: filterPart } : {}),
    });
    const [outRes, inRes] = await Promise.all([
      fetch(`/api/mi-out?${qs}`),
      fetch(`/api/mi-in?${qs}`),
    ]);
    const outData = await outRes.json();
    const inData = await inRes.json();
    if (outRes.ok) setOutRows(outData);
    if (inRes.ok) setInRows(inData);
  }, [filterDate, filterPart]);

  useEffect(() => {
    loadGrids();
    partRef.current?.focus();
  }, [loadGrids]);

  async function lookup() {
    if (!partNo.trim()) return;
    const res = await fetch(
      `/api/parts?partNo=${encodeURIComponent(partNo.trim())}`
    );
    const data = await res.json();
    if (!res.ok) {
      setPartName("");
      setStok(null);
      setLine("");
      setErr(data.error || "Part tidak ditemukan");
      return;
    }
    setErr(null);
    setPartName(data.partName);
    setStok(data.totalStock);
    setLine(data.lineCode || "");
    setFilterPart(partNo.trim());
  }

  function clearForm() {
    setPartNo("");
    setPartName("");
    setStok(null);
    setLine("");
    setQty("");
    partRef.current?.focus();
  }

  async function simpan() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/mi-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partNo, qty: Number(qty), picNik: pic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Gagal simpan");
        return;
      }
      setMsg("Data berhasil disimpan");
      clearForm();
      await loadGrids();
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!confirm("Void 1 data terakhir (Undo)?")) return;
    const res = await fetch("/api/mi-out?last=1");
    const last = await res.json();
    if (!last?.id) {
      setErr("Tidak ada data");
      return;
    }
    const v = await fetch(`/api/mi-out/${last.id}/void`, { method: "POST" });
    const data = await v.json();
    if (!v.ok) {
      setErr(data.error || "Gagal undo");
      return;
    }
    setMsg("Undo berhasil");
    await loadGrids();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">
        Data Stok WIP Siap Insert · MI Proses Line
      </h1>

      <section className="grid gap-3 rounded-lg border border-zinc-300 bg-white p-4 md:grid-cols-2">
        <label className="block text-sm">
          Part No.
          <input
            ref={partRef}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-base"
            value={partNo}
            onChange={(e) => setPartNo(e.target.value.toUpperCase())}
            onBlur={lookup}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookup().then(() => document.getElementById("qtyMi")?.focus());
              }
            }}
          />
        </label>
        <label className="block text-sm">
          Line
          <input
            className="mt-1 w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2"
            value={line}
            readOnly
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
          Stok WIP
          <input
            className={`mt-1 w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 ${stokClass}`}
            value={stok ?? ""}
            readOnly
          />
        </label>
        <label className="block text-sm">
          Qty Out
          <input
            id="qtyMi"
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-base"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          PIC (NIK)
          <input
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
            value={pic}
            onChange={(e) => setPic(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
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
            onClick={undo}
            className="rounded border border-zinc-400 bg-white px-4 py-2"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clearForm}
            className="rounded border border-zinc-400 bg-white px-4 py-2"
          >
            Clear
          </button>
        </div>
        {err && <p className="text-sm text-red-700 md:col-span-2">{err}</p>}
        {msg && <p className="text-sm text-emerald-700 md:col-span-2">{msg}</p>}
      </section>

      <section className="rounded-lg border border-zinc-300 bg-white p-4">
        <div className="mb-3 flex flex-wrap gap-3">
          <label className="text-sm">
            Short By Part
            <input
              className="mt-1 block rounded border px-2 py-1"
              value={filterPart}
              onChange={(e) => setFilterPart(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Tanggal
            <input
              type="date"
              className="mt-1 block rounded border px-2 py-1"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="self-end rounded border px-3 py-1 text-sm"
            onClick={() =>
              setFilterDate(new Date().toISOString().slice(0, 10))
            }
          >
            Hari ini
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Grid OUT */}
          <div className="overflow-hidden rounded border border-zinc-200">
            <h2 className="bg-sky-100 px-3 py-2 text-sm font-medium text-sky-950">
              Data Transaksi OUT {titleDate}
            </h2>
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b bg-sky-50">
                  <tr>
                    <th className="px-2 py-2">Tanggal</th>
                    <th className="px-2 py-2">Part No</th>
                    <th className="px-2 py-2">Part Name</th>
                    <th className="px-2 py-2">Qty OUT</th>
                    <th className="px-2 py-2">Input PIC</th>
                  </tr>
                </thead>
                <tbody>
                  {outRows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {new Date(r.trxAt).toLocaleString("id-ID")}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{r.part.partNo}</td>
                      <td className="px-2 py-1.5">{r.part.partName}</td>
                      <td className="px-2 py-1.5">{r.qty}</td>
                      <td className="px-2 py-1.5">
                        {r.picUser?.name || r.picUser?.nik}
                      </td>
                    </tr>
                  ))}
                  {outRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-zinc-500">
                        Belum ada data OUT
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grid IN */}
          <div className="overflow-hidden rounded border border-zinc-200">
            <h2 className="bg-lime-100 px-3 py-2 text-sm font-medium text-lime-950">
              Data Transaksi IN {titleDate}
            </h2>
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b bg-lime-50">
                  <tr>
                    <th className="px-2 py-2">TimeStamp</th>
                    <th className="px-2 py-2">Grup</th>
                    <th className="px-2 py-2">Part No</th>
                    <th className="px-2 py-2">Part Name</th>
                    <th className="px-2 py-2">Slip Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {inRows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {new Date(r.trxAt).toLocaleString("id-ID")}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{r.source}</td>
                      <td className="px-2 py-1.5 font-mono">{r.part.partNo}</td>
                      <td className="px-2 py-1.5">{r.part.partName}</td>
                      <td className="px-2 py-1.5">{r.qty}</td>
                    </tr>
                  ))}
                  {inRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-zinc-500">
                        Belum ada data IN
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
