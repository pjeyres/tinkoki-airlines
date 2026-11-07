// Destinations and place search
const C = window.Cesium;

// height is metres above the ellipsoid, heading in degrees (0 = north).
// Places with onGround start Loki sitting on the ground, ready to run and take off.
export const HOME_AIRPORT = {
  name: 'Lewes (LWS)', region: 'East Sussex, UK', code: 'LWS', label: 'LWS · Lewes',
  lon: 0.0012778, lat: 50.8811944, height: 300, heading: 180, onGround: true,
};

export const DESTINATIONS = [
  HOME_AIRPORT,
  { name: 'Golden Gate Bridge', region: 'San Francisco, USA', lon: -122.4985, lat: 37.8045, height: 260, heading: 40 },
  { name: 'Manhattan', region: 'New York, USA', lon: -74.0189, lat: 40.6892, height: 350, heading: 25 },
  { name: 'Grand Canyon', region: 'Arizona, USA', lon: -112.1129, lat: 36.0544, height: 2600, heading: 10 },
  { name: 'Eiffel Tower', region: 'Paris, France', lon: 2.2700, lat: 48.8520, height: 320, heading: 60 },
  { name: 'Big Ben & the Thames', region: 'London, UK', lon: -0.1100, lat: 51.4930, height: 250, heading: 330 },
  { name: 'Matterhorn', region: 'Zermatt, Switzerland', lon: 7.7200, lat: 45.9500, height: 4700, heading: 280 },
  { name: 'Mount Everest', region: 'Nepal & Tibet', lon: 86.8800, lat: 27.9400, height: 9400, heading: 20 },
  { name: 'Burj Khalifa', region: 'Dubai, UAE', lon: 55.2600, lat: 25.1850, height: 700, heading: 50 },
  { name: 'Shibuya & Tokyo Tower', region: 'Tokyo, Japan', lon: 139.7000, lat: 35.6450, height: 400, heading: 90 },
  { name: 'Sydney Harbour', region: 'Sydney, Australia', lon: 151.2050, lat: -33.8650, height: 260, heading: 70 },
  { name: 'Christ the Redeemer', region: 'Rio de Janeiro, Brazil', lon: -43.2300, lat: -22.9400, height: 900, heading: 20 },
  { name: 'Table Mountain', region: 'Cape Town, South Africa', lon: 18.4000, lat: -33.9300, height: 1400, heading: 60 },
  { name: 'Giza Pyramids', region: 'Cairo, Egypt', lon: 31.1200, lat: 29.9700, height: 300, heading: 270 },
  { name: 'Fjords', region: 'Geirangerfjord, Norway', lon: 7.1000, lat: 62.1000, height: 900, heading: 90 },
];

// Search with Cesium ion's Google geocoder when Google tiles are on (their
// terms require it), ion's default geocoder otherwise, and OpenStreetMap's
// Nominatim when there is no Cesium ion token at all.
export function makeSearch(scene, mode) {
  if (mode === 'google' || mode === 'ion') {
    const service = new C.IonGeocoderService({
      scene,
      geocodeProviderType: mode === 'google' ? C.IonGeocodeProviderType.GOOGLE : C.IonGeocodeProviderType.DEFAULT,
    });
    return async (query) => {
      const results = await service.geocode(query);
      return results.slice(0, 6).map((r) => {
        const carto = r.destination instanceof C.Rectangle
          ? C.Rectangle.center(r.destination)
          : C.Cartographic.fromCartesian(r.destination);
        return { name: r.displayName, lon: C.Math.toDegrees(carto.longitude), lat: C.Math.toDegrees(carto.latitude) };
      });
    };
  }
  return async (query) => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const list = await res.json();
    return list.map((r) => ({ name: r.display_name, lon: Number(r.lon), lat: Number(r.lat) }));
  };
}
