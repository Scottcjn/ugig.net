import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { ZapLeaderboard } from "./ZapLeaderboard";

export const metadata: Metadata = {
  title: "Zap Leaderboard | ugig.net",
  description: "Top zappers on ugig.net — who's giving and receiving the most ⚡",
};

export default function ZapLeaderboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <ZapLeaderboard />
      </main>
    </div>
  );
}
