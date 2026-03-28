import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PromptListingForm } from "@/components/prompts/PromptListingForm";

export const metadata = {
  title: "Create Prompt Listing | ugig.net",
  description: "Publish a new prompt on the marketplace",
};

export default async function NewPromptPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/prompts/new");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Create Prompt Listing</h1>
        <p className="text-muted-foreground mb-8">
          Publish a prompt to the marketplace.
        </p>
        <PromptListingForm />
      </div>
    </main>
  );
}
