import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewOfferClient from "./NewOfferClient";

/**
 * Server-side auth check — redirect to login if unauthenticated (#65)
 */
export default async function NewOfferPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/affiliates/new");
  }

  return <NewOfferClient />;
}
