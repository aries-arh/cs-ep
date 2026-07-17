"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth";

type Props = {
  user: SessionUser;
  children: React.ReactNode;
};

export function AppShell({ user, children }: Props) {
  const path = usePathname();
  const router = useRouter();

  const links: { href: string; label: string; show: boolean }[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      show: user.role === "LEADER" || user.role === "ADMIN",
    },
    {
      href: "/trx/ai",
      label: "Transaksi AI",
      show: user.canAi || user.role === "ADMIN" || user.role === "LEADER",
    },
    {
      href: "/trx/smt",
      label: "Transaksi SMT",
      show: user.canSmt || user.role === "ADMIN" || user.role === "LEADER",
    },
    {
      href: "/trx/mi",
      label: "Transaksi MI",
      show: user.canMi || user.role === "ADMIN" || user.role === "LEADER",
    },
    {
      href: "/admin",
      label: "Admin",
      show: user.role === "ADMIN" || user.role === "LEADER",
    },
  ];

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-300 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-2 font-semibold tracking-tight text-zinc-800">
            CS EP1 · Transaksi Stok
          </div>
          <nav className="flex flex-1 flex-wrap gap-1">
            {links
              .filter((l) => l.show)
              .map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded px-3 py-1.5 text-sm ${
                    path.startsWith(l.href)
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
          </nav>
          <div className="text-sm text-zinc-600">
            {user.name} · {user.role}
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Keluar
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
