import { NextResponse } from "next/server";
import { createCheckoutSessionForUser } from "@/lib/billing/stripeServer";
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

  let body: { successUrl?: string; cancelUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.successUrl || !body.cancelUrl) {
    return NextResponse.json(
      { error: "missing successUrl or cancelUrl" },
      { status: 400 },
    );
  }

  try {
    const result = await createCheckoutSessionForUser(supabase, {
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "checkout failed";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "subscription already active"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
