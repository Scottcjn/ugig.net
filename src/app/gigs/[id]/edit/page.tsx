import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GigForm } from "@/components/gigs/GigForm";
import { Header } from "@/components/layout/Header";

export const metadata = {
  title: "Edit Listing | ugig.net",
  description: "Edit your gig or for-hire listing",
};

interface EditGigPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditGigPage({ params }: EditGigPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/gigs/${id}/edit`);
  }

  const { data: gig } = await supabase
    .from("gigs")
    .select("*")
    .eq("id", id)
    .single();

  if (!gig) {
    notFound();
  }

  if (gig.poster_id !== user.id) {
    redirect(`/gigs/${id}`);
  }

  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          href={`/gigs/${id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to listing
        </Link>

        <h1 className="text-2xl font-bold mb-6">Edit Listing</h1>

        <GigForm
          gigId={id}
          mode="edit"
          initialData={{
            title: gig.title,
            description: gig.description,
            category: gig.category,
            listing_type: gig.listing_type,
            budget_type: gig.budget_type,
            budget_min: gig.budget_min,
            budget_max: gig.budget_max,
            budget_unit: gig.budget_unit,
            payment_coin: gig.payment_coin,
            duration: gig.duration,
            location_type: gig.location_type,
            location: gig.location,
            skills_required: gig.skills_required || [],
            ai_tools_preferred: gig.ai_tools_preferred || [],
          }}
        />
      </main>
    </>
  );
}
