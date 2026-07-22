// Records live fixtures. NOT run in CI. (The retired Ticketmaster recorder was
// removed with the TM client — JamBase is the live source; iTunes below is kept
// as the keyless preview-search fixture recorder.)
//   pnpm exec node --import tsx scripts/record-fixtures.ts itunes "Joe Bonamassa"
import { writeFileSync, mkdirSync } from 'node:fs';

const [what] = process.argv.slice(2);

async function main() {
  // iTunes Search API mode (Task 0.3 spike). NO KEY required.
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

  console.error('usage: record-fixtures.ts itunes "<artist name>"');
  process.exit(1);
}

main();
