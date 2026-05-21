import { VALUES_CHARACTERS, ValuesAlignmentClient } from "@related/shared";
import { getServerDeps } from "@/lib/deps/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ValuesRankView } from "../_ValuesRankView";

export const dynamic = "force-dynamic";

export default async function ValuesRankPage() {
  const { valuesAlignment } = await getServerDeps();
  const rows = await valuesAlignment.listAlignments();

  const alignmentByCharacterId = Object.fromEntries(
    rows.map((a) => [a.characterId, a.aligned] as const),
  );

  const allCharacters = ValuesAlignmentClient.resolveCharactersFromAlignments(
    rows,
    VALUES_CHARACTERS,
  );

  const initialOrder = rows
    .filter((a) => a.aligned && a.rankPosition != null)
    .sort((a, b) => (a.rankPosition ?? 0) - (b.rankPosition ?? 0))
    .map((a) => a.characterId);

  return (
    <>
      <PageHeader
        title="Rank your alignments"
        subtitle="Order the characters you resonate with most — top is strongest."
      />
      <ValuesRankView
        characters={allCharacters}
        alignments={alignmentByCharacterId}
        initialOrder={initialOrder}
        alignmentRows={rows}
      />
    </>
  );
}
