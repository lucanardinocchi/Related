import { Suspense } from "react";
import { getServerDeps } from "@/lib/deps/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContextEditor } from "./_ContextEditor";
import { ContextOnboardingLauncher } from "./_ContextOnboardingLauncher";

export const dynamic = "force-dynamic";

export default async function ContextPage() {
  const { userContext } = await getServerDeps();

  const [goals, situationalState, operatorStrengths] = await Promise.all([
    userContext.listGoals(),
    userContext.getSituationalState(),
    userContext.listOperatorStrengths(),
  ]);

  return (
    <>
      <PageHeader
        title="Your context"
        subtitle="Goals & values stick around. Situational state is your right-now. Strengths shape what the agent proposes."
      />
      <ContextEditor
        initialGoals={goals}
        initialSituationalState={situationalState}
        initialOperatorStrengths={operatorStrengths}
      />
      <Suspense fallback={null}>
        <ContextOnboardingLauncher />
      </Suspense>
    </>
  );
}
