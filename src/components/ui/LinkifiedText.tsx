"use client";

import { linkifyText } from "@/lib/linkify";

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{linkifyText(text)}</span>;
}
