"use client";

import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";

interface CurlSnippetProps {
  url: string;
  slug?: string;
}

const TABS = ["clawhub", "curl", "wget", "npx"] as const;
type Tab = (typeof TABS)[number];

function getCommand(tab: Tab, url: string, slug?: string): string {
  switch (tab) {
    case "clawhub":
      return `clawhub install ${slug || url}`;
    case "curl":
      return `curl -sL ${url} | tar xz`;
    case "wget":
      return `wget -qO- ${url} | tar xz`;
    case "npx":
      return `npx clawhub install ${slug || url}`;
  }
}

function getLabel(tab: Tab): string {
  switch (tab) {
    case "clawhub":
      return "ClawHub";
    case "curl":
      return "curl";
    case "wget":
      return "wget";
    case "npx":
      return "npx";
  }
}

export function CurlSnippet({ url, slug }: CurlSnippetProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("clawhub");
  const command = getCommand(activeTab, url, slug);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/80">
        <div className="flex items-center gap-1">
          <Terminal className="h-3 w-3 text-muted-foreground mr-1" />
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {getLabel(tab)}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="px-3 py-2 text-sm font-mono overflow-x-auto">
        <code>{command}</code>
      </pre>
    </div>
  );
}
