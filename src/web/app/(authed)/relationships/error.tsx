"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, Display, Eyebrow, EmptyState } from "@/components/ui";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RelationshipsError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[relationships]", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>People & Groups</Eyebrow>
        <Display className="mt-1">Relationships</Display>
      </div>
      <EmptyState
        title="Couldn't load relationships"
        description={
          error.message ||
          "Something went wrong while loading this page. Try again in a moment."
        }
        action={
          <div className="flex items-center justify-center gap-2">
            <Button variant="primary" onClick={reset}>
              Retry
            </Button>
            <Link href="/context">
              <Button variant="ghost">Go to context</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
