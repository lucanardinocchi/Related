import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar userEmail={user.email} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--layout-content-max-w)] px-10 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
