import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Card } from "@/components/ui";

export default function BillingCancelPage() {
  return (
    <>
      <PageHeader
        title="Checkout canceled"
        subtitle="No charge was made. You can subscribe anytime from Settings."
      />
      <Card className="p-4">
        <Link href="/settings">
          <Button type="button">Back to Settings</Button>
        </Link>
      </Card>
    </>
  );
}
