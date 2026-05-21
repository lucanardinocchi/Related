"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { getBrowserDeps } from "@/lib/deps/client";

function passwordResetRedirectTo(): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth/callback?next=/reset-password`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await getBrowserDeps().auth.requestPasswordReset(
        email,
        passwordResetRedirectTo(),
      );
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <PageHeader
        title="Reset password"
        subtitle={
          sent
            ? "Check your email for a link to set a new password."
            : "Enter your email and we will send you a reset link."
        }
      />

      <Card>
        {sent ? (
          <p className="text-sm text-muted">
            If an account exists for <span className="text-fg">{email}</span>,
            you will receive an email shortly. The link expires after a short
            time.
          </p>
        ) : (
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

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" loading={loading} className="w-full">
              Send reset link
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/sign-in" className="text-fg underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
