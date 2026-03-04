import { Header } from "@/components/layout/Header";

export const metadata = {
  title: "Wallet | ugig.net",
  description: "Manage your Lightning wallet balance",
};

export default function WalletLayout({
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
