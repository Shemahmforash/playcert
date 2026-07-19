// Records live fixtures from the Ticketmaster Discovery API.
// NOT run in CI. Run with the key loaded from .env.local:
//   pnpm exec node --env-file=.env.local --import tsx scripts/record-fixtures.ts tm-lisbon
import { writeFileSync, mkdirSync } from 'node:fs';

const key = process.env.TICKETMASTER_KEY!;
const [what] = process.argv.slice(2);

// Market centroids (lat,long). NOTE: Ticketmaster has no coverage in Portugal —
// the Lisbon query returns totalElements: 0. Madrid (nearest large covered
// market) is used to exercise the client and answer the spike questions.
const MARKETS: Record<string, { latlong: string; file: string; days: number; radius: number }> = {
  'tm-lisbon': { latlong: '38.7223,-9.1393', file: 'lisbon-14d.json', days: 14, radius: 30 },
  'tm-madrid': { latlong: '40.4168,-3.7038', file: 'madrid-14d.json', days: 14, radius: 30 },
  // Wider window: surfaces multi-attraction (headliner + support) events for the
  // billing-order spike; used as the primary parser test fixture.
  'tm-madrid-wide': { latlong: '40.4168,-3.7038', file: 'madrid-120d.json', days: 120, radius: 50 },
};

async function main() {
  // iTunes Search API mode (Task 0.3 spike). NO KEY required.
  //   pnpm exec node --import tsx scripts/record-fixtures.ts itunes "Joe Bonamassa"
  // Writes tests/fixtures/itunes/exact-hit.json.
  if (what === 'itunes') {
    const name = process.argv.slice(3).join(' ');
    if (!name) {
      console.error('usage: record-fixtures.ts itunes "<artist name>"');
      process.exit(1);
    }
    const url =
      `https://itunes.apple.com/search?term=${encodeURIComponent(name)}` +
      `&entity=musicTrack&limit=25`;
    const res = await fetch(url);
    mkdirSync('tests/fixtures/itunes', { recursive: true });
    writeFileSync(
      'tests/fixtures/itunes/exact-hit.json',
      JSON.stringify(await res.json(), null, 2),
    );
    console.log('recorded', res.status, 'itunes exact-hit.json for', name);
    return;
  }

  const market = MARKETS[what];
  if (market) {
    const start = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const end = new Date(Date.now() + market.days * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
    const url =
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}` +
      `&latlong=${market.latlong}&radius=${market.radius}&unit=km&classificationName=Music` +
      `&startDateTime=${start}&endDateTime=${end}&size=100&sort=date,asc`;
    const res = await fetch(url);
    mkdirSync('tests/fixtures/ticketmaster', { recursive: true });
    writeFileSync(
      `tests/fixtures/ticketmaster/${market.file}`,
      JSON.stringify(await res.json(), null, 2),
    );
    console.log('recorded', res.status, market.file);
  }
}

main();
