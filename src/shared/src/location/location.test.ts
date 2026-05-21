import {
  contactLocationFromPlace,
  contactLocationsMatch,
  placeFromContactLocation,
} from "./place";
import {
  distanceKm,
  isWithinRadiusKm,
} from "./distance";
import { filterContactsWithinRadius, contactHasLocation } from "./filterByRadius";

describe("place", () => {
  it("round-trips contact locations", () => {
    const place = {
      label: "Brooklyn, New York, United States",
      latitude: 40.6782,
      longitude: -73.9442,
    };

    expect(contactLocationFromPlace(place)).toEqual({
      area: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    expect(placeFromContactLocation(contactLocationFromPlace(place))).toEqual(
      place,
    );
  });

  it("detects unchanged locations", () => {
    const a = {
      area: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
    };
    const b = { ...a };

    expect(contactLocationsMatch(a, b)).toBe(true);
    expect(contactLocationsMatch(a, { ...a, area: "Lyon, France" })).toBe(false);
  });
});

describe("distance", () => {
  it("computes distance between two points", () => {
    const surryHills = { latitude: -33.8848, longitude: 151.2109 };
    const newtown = { latitude: -33.8969, longitude: 151.1799 };
    const km = distanceKm(surryHills, newtown);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(5);
  });

  it("checks radius membership", () => {
    const centre = { latitude: -33.8848, longitude: 151.2109 };
    const nearby = { latitude: -33.8969, longitude: 151.1799 };
    expect(isWithinRadiusKm(nearby, centre, 5)).toBe(true);
    expect(isWithinRadiusKm(nearby, centre, 2)).toBe(false);
  });
});

describe("filterContactsWithinRadius", () => {
  it("returns relationships whose contacts fall inside the radius", () => {
    const relationships = [
      {
        id: "r-1",
        contact: {
          area: "Surry Hills, New South Wales, Australia",
          latitude: -33.8848,
          longitude: 151.2109,
        },
      },
      {
        id: "r-2",
        contact: {
          area: "Melbourne, Victoria, Australia",
          latitude: -37.8136,
          longitude: 144.9631,
        },
      },
      {
        id: "r-3",
        contact: { area: null, latitude: null, longitude: null },
      },
    ];

    const filtered = filterContactsWithinRadius(
      relationships,
      { latitude: -33.8848, longitude: 151.2109 },
      5,
    );

    expect(filtered.map((r) => r.id)).toEqual(["r-1"]);
    expect(
      contactHasLocation({
        area: "Surry Hills, New South Wales, Australia",
        latitude: -33.8848,
        longitude: 151.2109,
      }),
    ).toBe(true);
  });
});
