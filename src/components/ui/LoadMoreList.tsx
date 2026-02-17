"use client";

import { useState, useTransition, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface LoadMoreListProps {
  initialItems: any[];
  totalCount: number;
  pageSize: number;
  fetchUrl: string;
  renderItem: (item: any) => ReactNode;
  emptyState?: ReactNode;
}

export function LoadMoreList({
  initialItems,
  totalCount,
  pageSize,
  fetchUrl,
  renderItem,
  emptyState,
}: LoadMoreListProps) {
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

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {items.length} of {totalCount}
      </p>

      <div className="space-y-4">
        {items.map((item) => renderItem(item))}
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
