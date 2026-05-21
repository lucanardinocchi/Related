export interface Place {
  label: string;
  latitude: number;
  longitude: number;
}

export interface ContactLocation {
  area: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function placeFromContactLocation(
  location: ContactLocation,
): Place | null {
  if (
    location.area &&
    location.latitude != null &&
    location.longitude != null
  ) {
    return {
      label: location.area,
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }
  return null;
}

export function contactLocationFromPlace(place: Place | null): ContactLocation {
  if (!place) {
    return { area: null, latitude: null, longitude: null };
  }
  return {
    area: place.label,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

export function contactLocationsMatch(
  a: ContactLocation,
  b: ContactLocation,
): boolean {
  return (
    a.area === b.area &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude
  );
}
