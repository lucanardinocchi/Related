import { NextResponse } from "next/server";
import { z } from "zod";
import { sendFeedback } from "@/lib/feedback/sendFeedbackEmail";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  type: z.enum(["bug", "feature"]),
  message: z.string().trim().min(1, "Message is required").max(5000),
  pagePath: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Invalid feedback payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await sendFeedback(supabase, {
      type: parsed.data.type,
      message: parsed.data.message,
      userEmail: user.email,
      pagePath: parsed.data.pagePath,
    });
    return NextResponse.json({ ok: true, channel: result.channel });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send feedback";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
