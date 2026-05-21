import { NextResponse } from "next/server";
import { createPortalSessionForUser } from "@/lib/billing/stripeServer";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { returnUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.returnUrl) {
    return NextResponse.json({ error: "missing returnUrl" }, { status: 400 });
  }

  try {
    const result = await createPortalSessionForUser(supabase, {
      returnUrl: body.returnUrl,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "portal failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
