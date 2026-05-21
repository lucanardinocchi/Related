import { isWithinRadiusKm, type GeoPoint } from "./distance";
import type { ContactLocation } from "./place";

export type { ContactLocation };

export function contactHasLocation(
  contact: ContactLocation,
): contact is ContactLocation & { latitude: number; longitude: number } {
  return contact.latitude != null && contact.longitude != null;
}

/** Filter contacts (or relationships with embedded contacts) by radius from a centre point. */
export function filterContactsWithinRadius<T extends { contact: ContactLocation }>(
  items: T[],
  centre: GeoPoint,
  radiusKm: number,
): T[] {
  return items.filter((item) => {
    if (!contactHasLocation(item.contact)) return false;
    return isWithinRadiusKm(
      { latitude: item.contact.latitude, longitude: item.contact.longitude },
      centre,
      radiusKm,
    );
  });
}
