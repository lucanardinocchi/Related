import { VALUES_CHARACTERS, ValuesAlignmentClient } from "@related/shared";
import { getServerDeps } from "@/lib/deps/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ValuesSwipeView } from "./_ValuesSwipeView";

export const dynamic = "force-dynamic";

export default async function ValuesPage() {
  const { valuesAlignment } = await getServerDeps();
  const rows = await valuesAlignment.listAlignments();

  const alignmentByCharacterId = Object.fromEntries(
    rows.map((a) => [a.characterId, a.aligned] as const),
  );

  const seedIds = new Set(VALUES_CHARACTERS.map((c) => c.id));
  const dynamicOnly = ValuesAlignmentClient.resolveCharactersFromAlignments(
    rows,
    VALUES_CHARACTERS,
  ).filter((c) => !seedIds.has(c.id));

  return (
    <>
      <PageHeader
        title="Values"
        subtitle="Swipe through characters on portrait video — align, pass, or skip. Right-swipes narrow who we show you next."
      />
      <ValuesSwipeView
        seedCharacters={VALUES_CHARACTERS}
        initialAlignments={alignmentByCharacterId}
        initialDynamicCharacters={dynamicOnly}
      />
    </>
  );
}
