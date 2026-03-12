"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check, ChevronDown, ChevronUp, Terminal } from "lucide-react";

interface Marketplace {
  name: string;
  url: string;
  submitUrl: string | null;
  method: string;
  description: string;
  /** CLI command template. Use {slug} and {sourceUrl} as placeholders. */
  cliInstall?: string;
  cliPublish?: string;
}

const MARKETPLACES: Marketplace[] = [
  {
    name: "ClawHub",
    url: "https://clawhub.com",
    submitUrl: null,
    method: "CLI",
    description: "OpenClaw ecosystem. Publish via CLI.",
    cliInstall: "clawhub install {slug}",
    cliPublish: "clawhub publish . --slug {slug} --version 1.0.0",
  },
  {
    name: "skills.sh",
    url: "https://skills.sh",
    submitUrl: null,
    method: "Auto-indexed",
    description: "Agent Skills Directory. Auto-indexes GitHub repos with SKILL.md.",
  },
  {
    name: "LobeHub Skills",
    url: "https://lobehub.com/skills",
    submitUrl: "https://lobehub.com/skills",
    method: "Submit",
    description: "Large SKILL.md marketplace. Open for every agent.",
    cliInstall: "npx @lobehub/cli skill install {slug}",
  },
  {
    name: "Goose Skills",
    url: "https://github.com/block/agent-skills",
    submitUrl: "https://github.com/block/agent-skills/fork",
    method: "PR",
    description: "Community contributions via public repo PR.",
    cliInstall: "goose skill add {sourceUrl}",
  },
  {
    name: "Kilo Marketplace",
    url: "https://kilo.ai/docs/customize/skills",
    submitUrl: "https://kilo.ai/docs/customize/skills",
    method: "PR",
    description: "Fork + pull request with valid SKILL.md.",
    cliInstall: "kilo skill install {slug}",
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
    cliPublish: "clawmart publish . --name {slug}",
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 rounded border border-border hover:bg-muted transition-colors shrink-0"
      title="Copy command"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

function renderCmd(template: string, slug: string, sourceUrl: string | null): string {
  let cmd = template.replace(/\{slug\}/g, slug);
  if (sourceUrl) {
    cmd = cmd.replace(/\{sourceUrl\}/g, sourceUrl);
  } else {
    cmd = cmd.replace(/\{sourceUrl\}/g, slug);
  }
  return cmd;
}

interface PublishElsewhereProps {
  slug: string;
  skillFileUrl?: string | null;
  sourceUrl?: string | null;
}

export function PublishElsewhere({ slug, skillFileUrl, sourceUrl }: PublishElsewhereProps) {
  const [expanded, setExpanded] = useState(false);

  const repoUrl = sourceUrl || skillFileUrl || null;
  const displayedMarketplaces = expanded ? MARKETPLACES : MARKETPLACES.slice(0, 4);

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Publish Everywhere</h2>
      <p className="text-sm text-muted-foreground">
        Maximize your skill&apos;s reach by listing it on multiple marketplaces. No credentials required for most.
      </p>

      {/* Marketplace list */}
      <div className="space-y-2">
        {displayedMarketplaces.map((mp) => {
          const installCmd = mp.cliInstall ? renderCmd(mp.cliInstall, slug, repoUrl) : null;
          const publishCmd = mp.cliPublish ? renderCmd(mp.cliPublish, slug, repoUrl) : null;
          const hasCommands = installCmd || publishCmd;

          return (
            <div
              key={mp.name}
              className="border border-border rounded-lg overflow-hidden"
            >
              <a
                href={mp.submitUrl || mp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm group-hover:text-primary transition-colors">
                      {mp.name}
                    </span>
                    <MethodBadge method={mp.method} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mp.description}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>

              {hasCommands && (
                <div className="border-t border-border bg-muted/30 px-3 py-2 space-y-1.5">
                  {installCmd && (
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />
                      <code className="text-xs font-mono text-foreground/80 truncate flex-1">
                        {installCmd}
                      </code>
                      <CopyButton text={installCmd} />
                    </div>
                  )}
                  {publishCmd && (
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3 w-3 text-blue-400 shrink-0" />
                      <code className="text-xs font-mono text-foreground/80 truncate flex-1">
                        {publishCmd}
                      </code>
                      <CopyButton text={publishCmd} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
