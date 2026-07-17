import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { InTransactionForm } from "@/components/InTransactionForm";

export default async function AiPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <InTransactionForm
        source="AI"
        title="TRANSAKSI PCB AUTO INSERT TO WC02"
        defaultPic={user.nik}
      />
    </AppShell>
  );
}
