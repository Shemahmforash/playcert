import type { BuildDeps } from './buildBundle';
import { realDeps } from './realDeps';
import { mockDeps } from './mockDeps';

/**
 * The single seam where the pipeline picks its data sources. When `MOCK_APIS=1`
 * (Playwright e2e + offline dev), swap the real JamBase/iTunes/MusicBrainz-backed
 * `realDeps` for the deterministic, network-free `mockDeps`. In every other case
 * — production, dev, unit tests — behaviour is IDENTICAL to calling `realDeps`
 * directly, so this is a no-op unless the env var is explicitly set.
 */
export function buildDeps(city: string): BuildDeps {
  return process.env.MOCK_APIS === '1' ? mockDeps(city) : realDeps(city);
}
