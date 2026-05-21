const EARTH_RADIUS_KM = 6371;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Great-circle distance in kilometres between two WGS84 points. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLon = Math.sin(dLon / 2);
  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfDLon * sinHalfDLon;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinRadiusKm(
  point: GeoPoint,
  centre: GeoPoint,
  radiusKm: number,
): boolean {
  return distanceKm(point, centre) <= radiusKm;
}
