import { Header } from "@/components/layout/Header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Affiliate Marketplace | ugig.net",
  description:
    "Promote digital products, AI skills, and tools — earn commissions in sats.",
  alternates: {
    canonical: "/affiliates",
  },
};

export default function AffiliatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
