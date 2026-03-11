"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Zap, Trophy, Medal, Award, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface LeaderboardEntry {
  rank: number;
  user: {
    id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  };
  total_sats: number;
  zap_count: number;
}

const periods = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-6 w-6 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-6 w-6 text-gray-400" />;
  if (rank === 3) return <Award className="h-6 w-6 text-amber-700" />;
  return <span className="text-sm font-bold text-muted-foreground w-6 text-center">{rank}</span>;
}

export function ZapLeaderboard() {
  const [period, setPeriod] = useState("all");
  const [sort, setSort] = useState<"received" | "sent">("received");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/leaderboard/zaps?period=${period}&sort=${sort}&limit=25`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) {
          return;
        }

        setEntries(data.leaderboard || []);
        setTotalUsers(data.total_users || 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period, sort]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="h-8 w-8 text-amber-500 fill-amber-500" /> Zap Leaderboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Top zappers on ugig.net — who&apos;s giving and receiving the most ⚡
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => {
              setLoading(true);
              setSort("received");
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              sort === "received"
                ? "bg-amber-500/10 text-amber-500 border-r border-border"
                : "text-muted-foreground hover:text-foreground border-r border-border"
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" /> Top Receivers
          </button>
          <button
            onClick={() => {
              setLoading(true);
              setSort("sent");
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              sort === "sent"
                ? "bg-amber-500/10 text-amber-500"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowUpRight className="h-4 w-4" /> Top Givers
          </button>
        </div>

        <div className="flex gap-2">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setLoading(true);
                setPeriod(p.value);
              }}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                period === p.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
        </div>
      ) : entries.length === 0 ? (
        <div className="border border-border rounded-lg p-16 text-center bg-card">
          <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-lg">No zaps yet for this period</p>
          <p className="text-muted-foreground text-sm mt-1">Be the first to ⚡ someone!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.user.id}
              className={`border rounded-lg p-4 bg-card flex items-center gap-4 transition-colors ${
                entry.rank <= 3
                  ? "border-amber-500/30 hover:border-amber-500/50"
                  : "border-border hover:border-amber-500/20"
              }`}
            >
              <div className="flex items-center justify-center w-8">
                <RankBadge rank={entry.rank} />
              </div>

              <Link href={entry.user.username ? `/u/${entry.user.username}` : "#"}>
                <Avatar className={`${entry.rank <= 3 ? "h-12 w-12" : "h-10 w-10"}`}>
                  {entry.user.avatar_url && <AvatarImage src={entry.user.avatar_url} />}
                  <AvatarFallback>
                    {(entry.user.name || entry.user.username || "?")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>

              <div className="flex-1 min-w-0">
                <Link
                  href={entry.user.username ? `/u/${entry.user.username}` : "#"}
                  className="font-medium text-foreground hover:underline truncate block"
                >
                  {entry.user.name || `@${entry.user.username}` || "Unknown"}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {entry.zap_count} zap{entry.zap_count !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="text-right flex-shrink-0">
                <div className={`text-lg font-bold flex items-center gap-1 ${entry.rank <= 3 ? "text-amber-500" : "text-foreground"}`}>
                  <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                  {entry.total_sats.toLocaleString()}
                </div>
                <span className="text-xs text-muted-foreground">sats</span>
              </div>
            </div>
          ))}

          <p className="text-center text-sm text-muted-foreground pt-4">
            {totalUsers} user{totalUsers !== 1 ? "s" : ""} have {sort === "received" ? "received" : "sent"} zaps
          </p>
        </div>
      )}
    </>
  );
}
