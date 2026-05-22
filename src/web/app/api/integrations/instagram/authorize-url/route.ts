import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { AuthClient } from "@related/shared";
import {
  assertInstagramAppIdConfigured,
  resolveInstagramAppId,
} from "@/lib/integrations/instagramConfig";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function resolveRedirectUri(request: Request, origin: string | null): string {
  if (!origin) {
    throw new Error("Missing request origin");
  }
  return `${origin.replace(/\/$/, "")}/settings/instagram/callback`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instagramAppId = resolveInstagramAppId();
  const whatsappAppId = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID?.trim() ?? null;

  try {
    assertInstagramAppIdConfigured(instagramAppId, whatsappAppId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Instagram is not configured";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const origin = request.headers.get("origin");
  let redirectUri: string;
  try {
    redirectUri = resolveRedirectUri(request, origin);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not resolve redirect URI";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const state = randomUUID();
  const auth = new AuthClient(supabase);
  const url = auth.buildInstagramOAuthUrl({
    appId: instagramAppId,
    redirectUri,
    state,
  });

  return NextResponse.json({ url, state });
}
