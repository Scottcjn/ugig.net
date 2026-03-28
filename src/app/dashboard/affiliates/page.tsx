import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AffiliateDashboardClient from "./DashboardClient";

/**
 * Server-side auth check — redirect to login if unauthenticated (#67)
 */
export default async function AffiliateDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/affiliates");
  }

  return <AffiliateDashboardClient />;
}
