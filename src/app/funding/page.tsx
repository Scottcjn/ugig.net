import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FundingClient } from "@/components/funding/FundingClient";
import { FUNDING_ADDRESSES } from "@/lib/funding";

export const metadata: Metadata = {
  title: "Fund ugig.net | Bitcoin Lightning",
  description:
    "Support ugig.net with Bitcoin Lightning. Get platform credits, lifetime premium, and supporter badges.",
};

export default function FundingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-10">
          <section className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight">
              Fund ugig.net ⚡
            </h1>
            <p className="text-muted-foreground text-lg">
              Support ugig.net by purchasing prepaid platform credits or a
              lifetime premium plan using Bitcoin Lightning. This is{" "}
              <strong>not an investment</strong> — it&apos;s a prepaid usage and
              supporter program with no expectation of profit or return.
            </p>
            <p className="text-sm text-muted-foreground">
              All contributions are non-refundable. Credits are consumed within
              the ugig.net platform. No tokens, no equity, no revenue sharing.
            </p>
          </section>

          <FundingClient />

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Direct Funding Addresses</h2>
            <p className="text-sm text-muted-foreground">
              You can also contribute directly using these addresses.
            </p>
            <div className="border rounded-lg divide-y">
              {Object.entries(FUNDING_ADDRESSES).map(([asset, address]) => (
                <div key={asset} className="p-3 sm:p-4">
                  <div className="text-xs font-medium text-muted-foreground mb-1">{asset}</div>
                  <code className="text-xs sm:text-sm break-all">{address}</code>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
