"use client";

import { useEffect, useState } from "react";

type Part = {
  id: number;
  partNo: string;
  partName: string;
  isActive: boolean;
  line: { code: string } | null;
};
type Line = { id: number; code: string; name: string | null };
type User = {
  id: number;
  nik: string;
  name: string;
  role: string;
  canAi: boolean;
  canSmt: boolean;
  canMi: boolean;
  isActive: boolean;
};

const emptyUserForm = {
  nik: "",
  name: "",
  role: "OPERATOR",
  password: "",
  canAi: false,
  canSmt: false,
  canMi: false,
  isActive: true,
};

export function AdminClient({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<"parts" | "users" | "export" | "stock">("parts");
  const [parts, setParts] = useState<Part[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [partNo, setPartNo] = useState("");
  const [partName, setPartName] = useState("");
  const [lineCode, setLineCode] = useState("LINE 1");

  const [stPart, setStPart] = useState("");
  const [stQty, setStQty] = useState("");

  const [userForm, setUserForm] = useState(emptyUserForm);
  const [editingNik, setEditingNik] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin");
    const data = await res.json();
    if (res.ok) {
      setParts(data.parts);
      setLines(data.lines);
      setUsers(data.users || []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function flash(ok: string | null, error: string | null = null) {
    setMsg(ok);
    setErr(error);
  }

  async function savePart() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsertPart",
          partNo,
          partName,
          lineCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(null, data.error || "Gagal simpan part");
        return;
      }
      flash("Part tersimpan");
      setPartNo("");
      setPartName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveStock() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setStocktaking",
          partNo: stPart,
          qty: Number(stQty),
        }),
      });
      const data = await res.json();
      flash(res.ok ? "Stocktaking tersimpan" : null, res.ok ? null : data.error);
    } finally {
      setBusy(false);
    }
  }

  function startEditUser(u: User) {
    setEditingNik(u.nik);
    setUserForm({
      nik: u.nik,
      name: u.name,
      role: u.role,
      password: "",
      canAi: u.canAi,
      canSmt: u.canSmt,
      canMi: u.canMi,
      isActive: u.isActive,
    });
    flash(null);
  }

  function resetUserForm() {
    setEditingNik(null);
    setUserForm(emptyUserForm);
  }

  async function saveUser() {
    setBusy(true);
    flash(null);
    try {
      if (!userForm.nik.trim() || !userForm.name.trim()) {
        flash(null, "NIK dan Nama wajib diisi");
        return;
      }
      if (!editingNik && !userForm.password.trim()) {
        flash(null, "Password wajib untuk user baru");
        return;
      }

      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsertUser",
          nik: userForm.nik.trim(),
          name: userForm.name.trim(),
          role: userForm.role,
          password: userForm.password.trim() || undefined,
          canAi: userForm.canAi,
          canSmt: userForm.canSmt,
          canMi: userForm.canMi,
          isActive: userForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(null, data.error || "Gagal simpan user");
        return;
      }
      flash(editingNik ? "User diperbarui" : "User ditambahkan");
      resetUserForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deactivateUser(nik: string) {
    if (!confirm(`Nonaktifkan user ${nik}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteUser", nik }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(null, data.error || "Gagal nonaktifkan");
        return;
      }
      flash(`User ${nik} dinonaktifkan`);
      if (editingNik === nik) resetUserForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function activateUser(nik: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activateUser", nik }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(null, data.error || "Gagal aktifkan");
        return;
      }
      flash(`User ${nik} diaktifkan`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "parts" as const, label: "Data Master · Part" },
    { id: "stock" as const, label: "Import Stocktaking" },
    { id: "export" as const, label: "Export" },
    ...(isAdmin ? [{ id: "users" as const, label: "User & Role" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <aside className="w-full shrink-0 rounded-lg border border-zinc-300 bg-white p-3 md:w-52">
        <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">Admin</div>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              flash(null);
            }}
            className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-sm ${
              tab === t.id ? "bg-zinc-800 text-white" : "hover:bg-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </aside>

      <div className="min-w-0 flex-1 space-y-4 rounded-lg border border-zinc-300 bg-white p-4">
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        {err && <p className="text-sm text-red-700">{err}</p>}

        {tab === "parts" && (
          <>
            {isAdmin && (
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  placeholder="Part No"
                  className="rounded border px-2 py-1.5 font-mono"
                  value={partNo}
                  onChange={(e) => setPartNo(e.target.value)}
                />
                <input
                  placeholder="Part Name"
                  className="rounded border px-2 py-1.5 md:col-span-2"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                />
                <select
                  className="rounded border px-2 py-1.5"
                  value={lineCode}
                  onChange={(e) => setLineCode(e.target.value)}
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.code}>
                      {l.code}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={savePart}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-white disabled:opacity-50 md:col-span-4 md:w-fit"
                >
                  Simpan Part
                </button>
              </div>
            )}
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-zinc-50">
                <tr>
                  <th className="px-2 py-2">Part No</th>
                  <th className="px-2 py-2">Part Name</th>
                  <th className="px-2 py-2">Line</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="px-2 py-1 font-mono">{p.partNo}</td>
                    <td className="px-2 py-1">{p.partName}</td>
                    <td className="px-2 py-1">{p.line?.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === "stock" && isAdmin && (
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Part No"
              className="rounded border px-2 py-1.5 font-mono"
              value={stPart}
              onChange={(e) => setStPart(e.target.value)}
            />
            <input
              placeholder="Qty stocktaking"
              className="rounded border px-2 py-1.5"
              value={stQty}
              onChange={(e) => setStQty(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={saveStock}
              className="rounded bg-zinc-800 px-3 py-1.5 text-white disabled:opacity-50"
            >
              Set Stocktaking Hari Ini
            </button>
          </div>
        )}

        {tab === "export" && (
          <div className="flex flex-wrap gap-2">
            <a
              className="rounded border px-3 py-2 text-sm hover:bg-zinc-50"
              href="/api/exports?type=mi-out"
            >
              Export MI hari ini
            </a>
            <a
              className="rounded border px-3 py-2 text-sm hover:bg-zinc-50"
              href="/api/exports?type=mi-in&source=AI"
            >
              Export AI hari ini
            </a>
            <a
              className="rounded border px-3 py-2 text-sm hover:bg-zinc-50"
              href="/api/exports?type=mi-in&source=SMT"
            >
              Export SMT hari ini
            </a>
          </div>
        )}

        {tab === "users" && isAdmin && (
          <div className="space-y-4">
            <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-sm font-medium">
                {editingNik ? `Edit user: ${editingNik}` : "Tambah user baru"}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-sm">
                  NIK
                  <input
                    className="mt-1 w-full rounded border px-2 py-1.5 font-mono"
                    value={userForm.nik}
                    disabled={Boolean(editingNik)}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, nik: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Nama
                  <input
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={userForm.name}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Role
                  <select
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, role: e.target.value }))
                    }
                  >
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="LEADER">LEADER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </label>
                <label className="text-sm">
                  Password {editingNik ? "(kosongkan = tidak diubah)" : ""}
                  <input
                    type="password"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={userForm.password}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, password: e.target.value }))
                    }
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={userForm.canAi}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, canAi: e.target.checked }))
                    }
                  />
                  Akses AI
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={userForm.canSmt}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, canSmt: e.target.checked }))
                    }
                  />
                  Akses SMT
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={userForm.canMi}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, canMi: e.target.checked }))
                    }
                  />
                  Akses MI
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={userForm.isActive}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                  />
                  Aktif
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveUser}
                  className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {editingNik ? "Update User" : "Tambah User"}
                </button>
                {editingNik && (
                  <button
                    type="button"
                    onClick={resetUserForm}
                    className="rounded border px-3 py-1.5 text-sm"
                  >
                    Batal Edit
                  </button>
                )}
              </div>
            </div>

            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-zinc-50">
                <tr>
                  <th className="px-2 py-2">NIK</th>
                  <th className="px-2 py-2">Nama</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">AI</th>
                  <th className="px-2 py-2">SMT</th>
                  <th className="px-2 py-2">MI</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="px-2 py-1 font-mono">{u.nik}</td>
                    <td className="px-2 py-1">{u.name}</td>
                    <td className="px-2 py-1">{u.role}</td>
                    <td className="px-2 py-1">{u.canAi ? "✓" : ""}</td>
                    <td className="px-2 py-1">{u.canSmt ? "✓" : ""}</td>
                    <td className="px-2 py-1">{u.canMi ? "✓" : ""}</td>
                    <td className="px-2 py-1">
                      {u.isActive ? (
                        <span className="text-emerald-700">Aktif</span>
                      ) : (
                        <span className="text-zinc-400">Nonaktif</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-zinc-50"
                          onClick={() => startEditUser(u)}
                        >
                          Edit
                        </button>
                        {u.isActive ? (
                          <button
                            type="button"
                            className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                            onClick={() => deactivateUser(u.nik)}
                          >
                            Nonaktif
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded border px-2 py-0.5 text-xs hover:bg-zinc-50"
                            onClick={() => activateUser(u.nik)}
                          >
                            Aktifkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
