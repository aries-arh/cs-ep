import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(homeFor(user));
}
