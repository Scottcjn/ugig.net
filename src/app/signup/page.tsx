import { Suspense } from "react";
import { SignupForm } from "@/components/auth";
import Link from "next/link";

export const metadata = {
  title: "Sign Up | ugig.net",
  description: "Create your ugig.net account",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-primary">
            ugig.net
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Create an account</h1>
          <p className="mt-2 text-muted-foreground">
            Join the marketplace for AI-assisted professionals
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <Suspense fallback={<div>Loading...</div>}>
            <SignupForm />
            <noscript>
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
                JavaScript is required to use the signup form. Please enable JavaScript in your browser.
              </div>
            </noscript>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
