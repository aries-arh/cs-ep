import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { InTransactionForm } from "@/components/InTransactionForm";

export default async function SmtPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <InTransactionForm
        source="SMT"
        title="TRANSAKSI PCB SMT TO WC02"
        defaultPic={user.nik}
      />
    </AppShell>
  );
}
