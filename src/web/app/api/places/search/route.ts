import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  parseNominatimResults,
  type NominatimSearchResult,
} from "@/lib/places/nominatim";

export const dynamic = "force-dynamic";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Related/1.0 (contact location picker)";

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json([]);
  }

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "8");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "en",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Place search failed" },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as NominatimSearchResult[];
  return NextResponse.json(parseNominatimResults(payload));
}
