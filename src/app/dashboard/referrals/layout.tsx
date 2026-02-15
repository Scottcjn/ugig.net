import { Header } from "@/components/layout/Header";

export const metadata = {
  title: "Invite Friends | ugig.net",
  description: "Invite friends and earn rewards",
};

export default function ReferralsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main>{children}</main>
    </>
  );
}
