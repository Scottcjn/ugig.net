import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Header } from "@/components/layout/Header";
import { SkillListingForm } from "@/components/skills/SkillListingForm";

interface EditSkillPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: "Edit Skill | ugig.net",
};

export default async function EditSkillPage({ params }: EditSkillPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/skills/${slug}/edit`);
  }

  const admin = createServiceClient();
  const { data: listing } = await admin
    .from("skill_listings" as any)
    .select("*")
    .eq("slug", slug)
    .single();

  if (!listing) notFound();

  const l = listing as any;
  if (l.seller_id !== user.id) {
    redirect("/dashboard/skills");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Edit Skill</h1>
          <p className="text-muted-foreground mb-8">
            Update your skill listing.
          </p>
          <SkillListingForm
            slug={l.slug}
            initialData={{
              title: l.title,
              tagline: l.tagline || "",
              description: l.description,
              price_sats: l.price_sats,
              category: l.category || "",
              tags: l.tags || [],
              status: l.status,
            }}
          />
        </div>
      </main>
    </div>
  );
}
