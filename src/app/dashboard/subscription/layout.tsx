import { Header } from "@/components/layout/Header";

export const metadata = {
  title: "Subscription | ugig.net",
  description: "Manage your subscription plan",
};

export default function SubscriptionLayout({
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
