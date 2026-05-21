import { VALUES_CHARACTERS } from "@related/shared";
import { getServerDeps } from "@/lib/deps/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ValuesSwipeView } from "./_ValuesSwipeView";

export const dynamic = "force-dynamic";

export default async function ValuesPage() {
  const { valuesAlignment } = await getServerDeps();
  const alignments = await valuesAlignment.listAlignments();

  const alignmentByCharacterId = Object.fromEntries(
    alignments.map((a) => [a.characterId, a.aligned] as const),
  );

  return (
    <>
      <PageHeader
        title="Values"
        subtitle="Swipe through characters whose values resonate — or don't. After 10 reviews, Related can propose goals for you to confirm."
      />
      <ValuesSwipeView
        characters={VALUES_CHARACTERS}
        initialAlignments={alignmentByCharacterId}
      />
    </>
  );
}
