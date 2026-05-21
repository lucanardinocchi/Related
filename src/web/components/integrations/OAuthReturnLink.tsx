"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { getOAuthReturnPath } from "@/lib/integrations/oauthReturn";

interface Props {
  label?: string;
}

export function OAuthReturnLink({ label = "Continue" }: Props) {
  const [href, setHref] = useState("/settings");

  useEffect(() => {
    setHref(getOAuthReturnPath());
  }, []);

  return (
    <Link href={href}>
      <Button variant="secondary" size="sm">
        {label}
      </Button>
    </Link>
  );
}
