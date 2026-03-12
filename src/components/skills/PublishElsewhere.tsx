"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface Marketplace {
  name: string;
  url: string;
  submitUrl: string | null;
  method: string;
  description: string;
}

const MARKETPLACES: Marketplace[] = [
  {
    name: "ClawHub",
    url: "https://clawhub.com",
    submitUrl: null, // CLI-based
    method: "CLI",
    description: "OpenClaw ecosystem. Publish via CLI.",
  },
  {
    name: "skills.sh",
    url: "https://skills.sh",
    submitUrl: null,
    method: "Auto-indexed",
    description: "Agent Skills Directory. Auto-indexes GitHub repos.",
  },
  {
    name: "LobeHub Skills",
    url: "https://lobehub.com/skills",
    submitUrl: "https://lobehub.com/skills",
    method: "Submit",
    description: "Large SKILL.md marketplace. Open for every agent.",
  },
  {
    name: "Goose Skills",
    url: "https://github.com/block/agent-skills",
    submitUrl: "https://github.com/block/agent-skills",
    method: "PR",
    description: "Community contributions via public repo PR.",
  },
  {
    name: "Kilo Marketplace",
    url: "https://kilo.ai/docs/customize/skills",
    submitUrl: "https://kilo.ai/docs/customize/skills",
    method: "PR",
    description: "Fork + pull request with valid SKILL.md.",
  },
  {
    name: "Skillstore",
    url: "https://skillstore.io",
    submitUrl: "https://skillstore.io/about",
    method: "GitHub repo",
    description: "Curated marketplace with automated security analysis.",
  },
  {
    name: "FreeMyGent",
    url: "https://freemygent.com",
    submitUrl: "https://freemygent.com",
    method: "Upload",
    description: "On-chain marketplace. Upload skill.md, set price, connect wallet.",
  },
  {
    name: "ClawMart",
    url: "https://www.shopclawmart.com",
    submitUrl: "https://www.shopclawmart.com",
    method: "API",
    description: "Commercial marketplace with terminal/API publishing.",
  },
  {
    name: "Manus Agent Skills",
    url: "https://manus.im/features/agent-skills",
    submitUrl: "https://manus.im/features/agent-skills",
    method: "Account",
    description: "Manus ecosystem. Free account required.",
  },
  {
    name: "VS Code Agent Skills",
    url: "https://github.com/formulahendry/vscode-agent-skills",
    submitUrl: "https://github.com/formulahendry/vscode-agent-skills",
    method: "GitHub",
    description: "Extension-based, pulls from GitHub repos.",
  },
  {
    name: "Moltbook / NormieClaw",
    url: "https://www.moltbook.com",
    submitUrl: "https://www.moltbook.com",
    method: "Submit",
    description: "Emerging marketplace. Submit, set price, quality check.",
  },
];

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    CLI: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    PR: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    Submit: "bg-green-500/10 text-green-500 border-green-500/20",
    Upload: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    API: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    Account: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    GitHub: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    "GitHub repo": "bg-gray-500/10 text-gray-400 border-gray-500/20",
    "Auto-indexed": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  };

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[method] || "bg-muted text-muted-foreground border-border"}`}
    >
      {method}
    </span>
  );
}

interface PublishElsewhereProps {
  slug: string;
  skillFileUrl?: string | null;
  sourceUrl?: string | null;
}

export function PublishElsewhere({ slug, skillFileUrl, sourceUrl }: PublishElsewhereProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const clawhubCmd = `clawhub install ${slug}`;
  const displayedMarketplaces = expanded ? MARKETPLACES : MARKETPLACES.slice(0, 4);

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Publish Everywhere</h2>
      <p className="text-sm text-muted-foreground">
        Maximize your skill&apos;s reach by listing it on multiple marketplaces. No credentials required for most.
      </p>

      {/* ClawHub install command */}
      <div className="bg-muted/50 border border-border rounded-lg p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-sm flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground select-none">$</span>
            <code className="text-foreground truncate">{clawhubCmd}</code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(clawhubCmd);
              setCopiedCmd(true);
              setTimeout(() => setCopiedCmd(false), 2000);
            }}
            className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors shrink-0"
          >
            {copiedCmd ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Marketplace grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {displayedMarketplaces.map((mp) => (
          <a
            key={mp.name}
            href={mp.submitUrl || mp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-sm group-hover:text-primary transition-colors">
                  {mp.name}
                </span>
                <MethodBadge method={mp.method} />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {mp.description}
              </p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}
      </div>

      {/* Show more/less */}
      {MARKETPLACES.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> Show {MARKETPLACES.length - 4} more marketplaces
            </>
          )}
        </button>
      )}

      {(skillFileUrl || sourceUrl) && (
        <p className="text-xs text-muted-foreground">
          💡 Most marketplaces accept a GitHub repo URL or SKILL.md link — use yours to publish quickly.
        </p>
      )}
    </div>
  );
}
