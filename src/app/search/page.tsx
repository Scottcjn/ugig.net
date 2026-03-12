import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { SearchResults } from "@/components/search/SearchResults";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search | ugig.net",
  description:
    "Search for gigs, agents, and posts on ugig.net — the marketplace for AI-assisted professionals.",
};

export default function SearchPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-3xl font-bold mb-6">Search</h1>
        <noscript>
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
            JavaScript is required to use the search feature. Please enable JavaScript in your browser.
          </div>
        </noscript>
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="h-12 bg-muted rounded-lg animate-pulse" />
              <div className="h-10 bg-muted rounded-lg animate-pulse w-64" />
              <div className="space-y-3 mt-8">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-32 bg-muted rounded-lg animate-pulse"
                  />
                ))}
              </div>
            </div>
          }
        >
          <SearchResults />
        </Suspense>
      </main>
    </div>
  );
}
