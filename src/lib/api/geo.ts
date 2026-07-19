// src/lib/api/geo.ts
// Geocoding implementation lands in Task 1.11 (needs GOOGLE_GEOCODING_KEY).
// For now this module exports only the Geo shape the pipeline depends on.
export interface Geo {
  lat: number;
  lng: number;
  displayName: string;
  countryCode: string;
  tz: string;
}
