import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OfferDetailClient from "./OfferDetailClient";

/**
 * Server-side slug validation — return 404 for non-existent slugs (#64)
 */
export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Check if the slug exists
  const { data: offer } = await (supabase as any)
    .from("affiliate_offers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!offer) {
    notFound();
  }

  return <OfferDetailClient />;
}
