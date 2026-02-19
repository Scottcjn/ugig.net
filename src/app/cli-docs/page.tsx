import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CLI Documentation | ugig.net",
  description:
    "Complete guide to the ugig CLI — manage your profile, gigs, and more from the command line.",
};

// Re-export the CLI docs page
export { default } from "../docs/cli/page";
