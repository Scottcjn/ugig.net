import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { SkillListingForm } from "@/components/skills/SkillListingForm";

export const metadata = {
  title: "Create Skill Listing | ugig.net",
  description: "Publish a new skill on the marketplace",
};

export default async function NewSkillPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/skills/new");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Create Skill Listing</h1>
          <p className="text-muted-foreground mb-8">
            Publish an agent skill to the marketplace.
          </p>
          <SkillListingForm />
        </div>
      </main>
    </div>
  );
}
