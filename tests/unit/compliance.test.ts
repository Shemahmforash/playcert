import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json';
import itunesFixture from '../fixtures/itunes/exact-hit.json';
import { parseSearch } from '../../src/lib/api/itunes';
import { tmQueue, itunesQueue, mbQueue, jambaseQueue } from '../../src/lib/queue';

/**
 * compliance.test.ts — the launch-checklist invariants that had no automated
 * proof yet (Task 5.5). These are the machine-checkable belts behind LAUNCH.md:
 * every one guards a promise Earshot makes at launch and fails CI the instant a
 * future change quietly breaks it. File/regex source-scans are used deliberately
 * — they're the robust way to prove a *negative* ("no cookies anywhere", "geo is
 * never read on the cached surface") across the whole tree, not just one module.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** Recursively collect every .ts/.tsx source file under `dir`. */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectSources(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const SRC_FILES = collectSources(SRC);
const rel = (f: string) => f.slice(ROOT.length + 1);
const read = (f: string) => readFileSync(f, 'utf8');

// ── Audio is never proxied: previews always stream from an Apple host ──────────
describe('audio provenance — previews come only from Apple (no proxying)', () => {
  // The <audio> element is bound EXCLUSIVELY to track.previewUrl (see below), and
  // every previewUrl the iTunes client emits is an Apple-hosted stream. Together
  // these prove the app never serves audio from its own origin / a proxy.
  const APPLE_AUDIO = /\.apple\.com|mzstatic/;

  it('every parsed previewUrl in the recorded iTunes fixture is an Apple host', () => {
    const candidates = parseSearch(itunesFixture);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(
        APPLE_AUDIO.test(c.previewUrl),
        `previewUrl is not an Apple host: ${c.previewUrl}`,
      ).toBe(true);
    }
  });

  it('the single <audio> element is sourced only from track.previewUrl', () => {
    const screen = read(join(SRC, 'components/PlaylistScreen.tsx'));
    // Declarative binding on the one reused element.
    expect(screen).toContain('src={current?.track.previewUrl}');
    // Any imperative `el.src = …` assignment must derive from a previewUrl — a
    // stray `el.src = someProxyUrl` would fail this.
    const imperative = [...screen.matchAll(/\.src\s*=\s*([^;\n]+)/g)].map((m) => m[1]);
    for (const rhs of imperative) {
      expect(
        /previewUrl|\burl\b/.test(rhs),
        `audio .src assigned from a non-previewUrl source: ${rhs.trim()}`,
      ).toBe(true);
    }
  });
});

// ── MusicBrainz sends an identifying, non-empty User-Agent (their ToS) ─────────
describe('MusicBrainz — a non-empty, app-identifying User-Agent is sent', () => {
  const mb = read(join(SRC, 'lib/api/musicbrainz.ts'));

  it('defines a User-Agent constant that names the app and a contact', () => {
    const m = mb.match(/USER_AGENT\s*=\s*'([^']+)'/);
    expect(m, 'USER_AGENT constant not found').toBeTruthy();
    const ua = m![1];
    expect(ua.length).toBeGreaterThan(0);
    expect(ua).toMatch(/Earshot/); // identifies the app
    expect(ua).toMatch(/https?:\/\/|@/); // carries a contact URL / email per MB ToS
  });

  it("attaches that User-Agent to the outbound request's headers", () => {
    expect(mb).toMatch(/'User-Agent':\s*USER_AGENT/);
  });
});

// ── Rate queues stay at their configured (conservative) spacings ───────────────
describe('rate queues — configured minSpacing floors are not loosened', () => {
  // Introspect the LIVE singletons (not the source text): the real runtime value
  // is the honest thing to assert. A PR that widens any of these to chase speed
  // fails here — the queues are the client-side belt for each provider's limit.
  const spacing = (q: unknown) =>
    (q as { opts: { minSpacingMs: number } }).opts.minSpacingMs;

  it('Ticketmaster queue holds its ~350ms spike-arrest floor', () => {
    expect(spacing(tmQueue)).toBe(350);
  });
  it('iTunes queue holds its 3500ms (~17/min) floor', () => {
    expect(spacing(itunesQueue)).toBe(3500);
  });
  it('MusicBrainz queue holds its 1000ms (1/s) floor', () => {
    expect(spacing(mbQueue)).toBe(1000);
  });
  it('JamBase queue holds its 250ms defensive floor', () => {
    expect(spacing(jambaseQueue)).toBe(250);
  });
});

// ── No cookies: state lives in localStorage (allowed), never cookies ───────────
describe('no cookies — the app writes no cookie state anywhere in src', () => {
  it('uses no cookie-writing API (Set-Cookie / document.cookie / cookies())', () => {
    const offenders: string[] = [];
    for (const f of SRC_FILES) {
      const body = read(f);
      if (/set-cookie/i.test(body)) offenders.push(`${rel(f)}: Set-Cookie`);
      if (/document\.cookie/.test(body)) offenders.push(`${rel(f)}: document.cookie`);
      // The next/headers cookie store (read OR write). `headers()` is fine and is
      // NOT matched here; only the cookies() jar counts as cookie usage.
      if (/\bcookies\s*\(\s*\)/.test(body)) offenders.push(`${rel(f)}: cookies()`);
    }
    expect(offenders, `cookie usage found:\n${offenders.join('\n')}`).toEqual([]);
  });
});

// ── No database / KV client in the dependency tree ─────────────────────────────
describe('no database — no DB/KV client is a dependency', () => {
  it('package.json declares no relational/document/KV client', () => {
    const banned = [
      'pg', 'pg-native', 'postgres', 'mysql', 'mysql2', 'mongodb', 'mongoose',
      'redis', 'ioredis', 'prisma', '@prisma/client', 'drizzle-orm', 'drizzle-kit',
      'better-sqlite3', 'sqlite3', 'kysely', 'typeorm', 'sequelize',
      '@vercel/kv', '@vercel/postgres', '@upstash/redis', '@planetscale/database',
      '@neondatabase/serverless', 'firebase', 'firebase-admin', '@supabase/supabase-js',
    ];
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    } as Record<string, string>;
    const names = Object.keys(deps);
    const found = names.filter((n) => banned.includes(n));
    expect(found, `unexpected DB/KV client(s) in package.json: ${found.join(', ')}`).toEqual(
      [],
    );
  });
});

// ── Geo is read only in middleware, so /[city]/[window] stays cache-pure ───────
describe('geo isolation — the cached city surface reads no request geo', () => {
  // The cacheable render surface is src/app/[city]/** (wrapped in `use cache`).
  // It MUST be a pure function of its URL — reading any request header there would
  // poison the shared cache with one visitor's location. (The landing picker `/`
  // reads the IP city-name for a prefill hint, but it is an uncached, per-request
  // Suspense hole — a different surface, deliberately excluded here.)
  const cityFiles = SRC_FILES.filter((f) => rel(f).startsWith(join('src', 'app', '[city]')));

  it('has a city surface to check (guards against a bad path glob)', () => {
    expect(cityFiles.length).toBeGreaterThan(0);
  });

  it('the [city] render subtree reads no request headers / geo at all', () => {
    const offenders: string[] = [];
    for (const f of cityFiles) {
      const body = read(f);
      for (const bad of ['next/headers', 'x-vercel-ip', 'latLngFromHeaders', 'cityFromHeaders', 'rootRedirectSlug']) {
        if (body.includes(bad)) offenders.push(`${rel(f)}: ${bad}`);
      }
    }
    expect(offenders, `geo/header read on cached surface:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the IP→redirect geo path is referenced only by middleware (+ its geo.ts defs)', () => {
    const allowed = new Set([join('src', 'middleware.ts'), join('src', 'lib', 'api', 'geo.ts')]);
    const offenders: string[] = [];
    for (const f of SRC_FILES) {
      if (allowed.has(rel(f))) continue;
      const body = read(f);
      if (/latLngFromHeaders|rootRedirectSlug/.test(body)) {
        offenders.push(rel(f));
      }
    }
    expect(offenders, `redirect-geo used outside middleware:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });
});
