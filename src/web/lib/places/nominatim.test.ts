import {
  formatNominatimPlace,
  parseNominatimResults,
  type NominatimSearchResult,
} from "./nominatim";

describe("formatNominatimPlace", () => {
  it("prefers suburb, state, and country from address details", () => {
    const result: NominatimSearchResult = {
      place_id: 1,
      lat: "-33.8848",
      lon: "151.2109",
      display_name:
        "Surry Hills, Sydney, Council of the City of Sydney, New South Wales, Australia",
      address: {
        suburb: "Surry Hills",
        city: "Sydney",
        state: "New South Wales",
        country: "Australia",
      },
    };

    expect(formatNominatimPlace(result)).toBe(
      "Surry Hills, New South Wales, Australia",
    );
  });

  it("formats international cities", () => {
    const result: NominatimSearchResult = {
      place_id: 2,
      lat: "48.8566",
      lon: "2.3522",
      display_name: "Paris, Île-de-France, France métropolitaine, France",
      address: {
        city: "Paris",
        region: "Île-de-France",
        country: "France",
      },
    };

    expect(formatNominatimPlace(result)).toBe("Paris, Île-de-France, France");
  });
});

describe("parseNominatimResults", () => {
  it("drops invalid coordinates", () => {
    expect(
      parseNominatimResults([
        {
          place_id: 3,
          lat: "not-a-number",
          lon: "151.2109",
          display_name: "Invalid",
        },
      ]),
    ).toEqual([]);
  });

  it("maps valid results to place suggestions", () => {
    expect(
      parseNominatimResults([
        {
          place_id: 4,
          lat: "40.6782",
          lon: "-73.9442",
          display_name: "Brooklyn, Kings County, New York, United States",
          address: {
            suburb: "Brooklyn",
            state: "New York",
            country: "United States",
          },
        },
      ]),
    ).toEqual([
      {
        id: "4",
        label: "Brooklyn, New York, United States",
        latitude: 40.6782,
        longitude: -73.9442,
      },
    ]);
  });
});
