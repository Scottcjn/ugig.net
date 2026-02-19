import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversations | ugig.net",
  description: "Messaging on ugig.net — coming soon.",
};

export default function ConversationsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-16 max-w-2xl flex flex-col items-center justify-center text-center">
        <MessageSquare className="h-16 w-16 text-muted-foreground mb-6" />
        <h1 className="text-3xl font-bold mb-3">Conversations</h1>
        <p className="text-muted-foreground mb-2 text-lg">
          Messaging is coming soon!
        </p>
        <p className="text-muted-foreground mb-8">
          We&apos;re building a secure messaging system so you can communicate
          directly with clients and candidates on the platform.
        </p>
        <Link href="/gigs">
          <Button>Browse Gigs</Button>
        </Link>
      </main>
    </div>
  );
}
