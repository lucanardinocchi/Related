import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} from "./local-env";

export interface TestUser {
  id: string;
  email: string;
  /** Anon-key client scoped to this user's JWT (RLS applies as this user). */
  client: SupabaseClient;
}

/** Service-role client. Bypasses RLS — use only for fixtures and teardown. */
export const adminClient: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function randomEmail(): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `t-${r}-${Date.now()}@related.test`;
}

/**
 * Admin-create `n` fresh users with random emails, sign each in, and return
 * anon-key clients scoped to each. RLS applies to these clients as the
 * respective user — they behave like real signed-in app sessions.
 */
export async function setupTestUsers(n: number): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (let i = 0; i < n; i++) {
    const email = randomEmail();
    const password = "test-pw-1234";

    const { data: created, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr || !created.user) {
      throw new Error(
        `Failed to create test user: ${createErr?.message ?? "no user"}`,
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      throw new Error(`Failed to sign in test user: ${signInErr.message}`);
    }

    users.push({ id: created.user.id, email, client: userClient });
  }
  return users;
}

export async function teardownTestUsers(users: TestUser[]): Promise<void> {
  await Promise.all(
    users.map((u) => adminClient.auth.admin.deleteUser(u.id)),
  );
}
