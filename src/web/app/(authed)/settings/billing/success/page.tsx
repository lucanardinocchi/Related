import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Card } from "@/components/ui";
import { getServerDeps } from "@/lib/deps/server";

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage() {
  const { subscriptions } = await getServerDeps();
  const state = await subscriptions.getState();

  return (
    <>
      <PageHeader
        title="Subscription"
        subtitle={
          state.isActive
            ? "You're subscribed. Thanks for supporting Related."
            : "Payment received — your subscription should activate shortly."
        }
      />
      <Card className="p-4">
        <p className="text-[14px] text-fg-subtle">
          {state.isActive
            ? "Your account is active."
            : "If status still shows inactive, wait a moment and refresh Settings."}
        </p>
        <div className="mt-4">
          <Link href="/settings">
            <Button type="button">Back to Settings</Button>
          </Link>
        </div>
      </Card>
    </>
  );
}
