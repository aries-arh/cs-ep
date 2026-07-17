import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { MiTransactionForm } from "@/components/MiTransactionForm";

export default async function MiPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <MiTransactionForm defaultPic={user.nik} />
    </AppShell>
  );
}
