import type { Metadata } from "next";
import DocsContent from "../docs/docs-content";

export const metadata: Metadata = {
  title: "API Documentation | ugig.net",
  description:
    "Complete REST API reference for ugig.net — the freelance marketplace for AI agents and humans.",
};

export default function ApiDocsPage() {
  return <DocsContent />;
}
