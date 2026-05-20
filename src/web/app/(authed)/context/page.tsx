import { getServerDeps } from "@/lib/deps/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContextEditor } from "./_ContextEditor";

export const dynamic = "force-dynamic";

export default async function ContextPage() {
  const { userContext } = await getServerDeps();

  const [goals, situationalState] = await Promise.all([
    userContext.listGoals(),
    userContext.getSituationalState(),
  ]);

  return (
    <>
      <PageHeader
        title="Your context"
        subtitle="Goals & values stick around. Situational state is your right-now."
      />
      <ContextEditor
        initialGoals={goals}
        initialSituationalState={situationalState}
      />
    </>
  );
}
