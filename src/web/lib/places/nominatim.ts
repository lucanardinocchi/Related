export interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
}

export interface NominatimSearchResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NominatimAddress;
}

export interface PlaceSuggestion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

/** Build a concise human label from a Nominatim result. */
export function formatNominatimPlace(result: NominatimSearchResult): string {
  const address = result.address;
  if (address) {
    const locality =
      address.suburb ??
      address.neighbourhood ??
      address.city_district ??
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      result.name;

    const parts = [
      locality,
      address.state ?? address.region,
      address.country,
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(", ");
  }

  if (result.name) return result.name;
  return shortenDisplayName(result.display_name);
}

export function parseNominatimResults(
  results: NominatimSearchResult[],
): PlaceSuggestion[] {
  return results
    .map((result) => {
      const latitude = Number.parseFloat(result.lat);
      const longitude = Number.parseFloat(result.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        id: String(result.place_id),
        label: formatNominatimPlace(result),
        latitude,
        longitude,
      };
    })
    .filter((place): place is PlaceSuggestion => place != null);
}

function shortenDisplayName(displayName: string): string {
  const parts = displayName.split(",").map((part) => part.trim());
  if (parts.length <= 3) return displayName;
  return parts.slice(0, 3).join(", ");
}
