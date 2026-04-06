import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PromptListingForm } from "@/components/prompts/PromptListingForm";

interface EditPromptPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: "Edit Prompt | ugig.net",
};

export default async function EditPromptPage({ params }: EditPromptPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/prompts/${slug}/edit`);
  }

  const admin = createServiceClient();
  const { data: listing } = await admin
    .from("prompt_listings" as any)
    .select("*")
    .eq("slug", slug)
    .single();

  if (!listing) notFound();

  const l = listing as any;
  if (l.seller_id !== user.id) {
    redirect("/dashboard/prompts");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Edit Prompt</h1>
        <p className="text-muted-foreground mb-8">
          Update your prompt listing.
        </p>
        <PromptListingForm
          slug={l.slug}
          initialData={{
            title: l.title,
            tagline: l.tagline || "",
            description: l.description,
            price_sats: l.price_sats,
            category: l.category || "",
            tags: l.tags || [],
            status: l.status,
            prompt_text: l.prompt_text || "",
            model_compatibility: l.model_compatibility || [],
            example_output: l.example_output || "",
            use_case: l.use_case || "",
          }}
        />
      </div>
    </main>
  );
}
