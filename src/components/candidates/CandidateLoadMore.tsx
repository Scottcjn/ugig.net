"use client";

import { useState } from "react";
import { CandidateCard } from "./CandidateCard";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface CandidateLoadMoreProps {
  initialItems: any[];
  totalCount: number;
  pageSize: number;
  fetchUrl: string;
  highlightTags: string[];
}

export function CandidateLoadMore({
  initialItems,
  totalCount,
  pageSize,
  fetchUrl,
  highlightTags,
}: CandidateLoadMoreProps) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const hasMore = items.length < totalCount;

  async function loadMore() {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const sep = fetchUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${fetchUrl}${sep}page=${nextPage}`);
      if (!res.ok) return;
      const json = await res.json();
      setItems((prev) => [...prev, ...(json.data || [])]);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {items.length} of {totalCount}
      </p>

      <div className="space-y-4">
        {items.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            highlightTags={highlightTags}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
            className="min-w-[140px]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
