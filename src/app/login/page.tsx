"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login gagal");
        return;
      }
      router.push(data.home || "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-200 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white p-8 shadow-sm"
      >
        <h1 className="text-center text-lg font-semibold tracking-tight">
          CS EP1 — Transaksi Stok
        </h1>
        <p className="mt-1 text-center text-sm text-zinc-500">EP-STOK / MI</p>

        <label className="mt-6 block text-sm">
          NIK / Username
          <input
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
            value={nik}
            onChange={(e) => setNik(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>
        <label className="mt-3 block text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded bg-zinc-800 py-2.5 font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
        >
          Masuk
        </button>
        <p className="mt-4 text-center text-xs text-zinc-500">
          Intranet only · Hubungi Admin jika akun terkunci
        </p>
      </form>
    </div>
  );
}
