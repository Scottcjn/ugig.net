import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { DirectoryNewForm } from "./DirectoryNewForm";

export const metadata: Metadata = {
  title: "List Your Project | Project Directory | ugig.net",
  description: "Add your project to the ugig.net directory for 500 sats.",
};

export default function NewDirectoryListingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <DirectoryNewForm />
      </main>
    </div>
  );
}
