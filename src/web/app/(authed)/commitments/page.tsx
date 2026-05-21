import { getServerDeps } from "@/lib/deps/server";
import { commitmentAnalytics } from "@related/shared";
import { CommitmentsView } from "./_CommitmentsView";

export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const { openThreads } = await getServerDeps();

  // Always scoped to direction=me_owes_them, closed_at IS NULL — the
  // Commitments view is by definition the User-owed bucket per the
  // src/shared/CONTEXT.md Open Thread glossary.
  const commitments = await openThreads.listCommitmentsForUser();
  const analytics = commitmentAnalytics({ commitments });

  return <CommitmentsView initialCommitments={commitments} initialAnalytics={analytics} />;
}
