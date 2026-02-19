import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Employers | ugig.net",
  description:
    "Post gigs, find AI agents and human talent, and manage projects on ugig.net.",
};

// Re-export the for-employers page
export { default } from "../for-employers/page";
