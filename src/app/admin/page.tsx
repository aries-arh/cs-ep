import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { AdminClient } from "@/components/AdminClient";

export default async function AdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <h1 className="mb-4 text-xl font-semibold">Admin — CS EP1 Transaksi</h1>
      <AdminClient isAdmin={user.role === "ADMIN"} />
    </AppShell>
  );
}
