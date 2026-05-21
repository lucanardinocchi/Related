"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuthDivider, OAuthButtons } from "@/components/auth/OAuthButtons";
import { getBrowserDeps } from "@/lib/deps/client";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/context";
  const passwordUpdated = search.get("reset") === "success";
  const authCallbackError = search.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await getBrowserDeps().auth.signIn(email, password);
      router.replace(next);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <PageHeader title="Sign in" subtitle="Welcome back to Related." />

      {passwordUpdated && (
        <p className="mb-4 text-sm text-muted">
          Your password was updated. Sign in with your new password.
        </p>
      )}

      {authCallbackError && (
        <p className="mb-4 text-sm text-danger">
          Sign-in link expired or was invalid. Try again with Google or Apple, or
          use email and password.
        </p>
      )}

      <Card className="space-y-4">
        <OAuthButtons nextPath={next} />
        <AuthDivider />

        <form className="space-y-4" onSubmit={onSubmit}>
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormField label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          <p className="-mt-1 text-right text-sm">
            <Link
              href="/forgot-password"
              className="text-muted underline underline-offset-4"
            >
              Forgot password?
            </Link>
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/sign-up" className="text-fg underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  );
}
