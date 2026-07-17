import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <DashboardClient />
    </AppShell>
  );
}
