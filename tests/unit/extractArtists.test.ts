import { describe, it, expect } from 'vitest';
import { normalizeName, detectTribute, extractArtists } from '../../src/lib/pipeline/extractArtists';

describe('normalizeName', () => {
  it.each([
    ['Live Nation presents Khruangbin', 'Khruangbin'],
    ['Khruangbin — A La Sala Tour', 'Khruangbin'],
    ['Fontaines D.C. - Romance Tour 2026', 'Fontaines D.C.'],
    ['BALTHVS', 'BALTHVS'],
  ])('%s → %s', (raw, expected) => expect(normalizeName(raw)).toBe(expected));
});

describe('detectTribute', () => {
  it('flags strong patterns unconditionally', () => {
    expect(detectTribute('Letz Zep — Led Zeppelin Tribute')).toBe(true);
    expect(detectTribute('A Tribute to ABBA')).toBe(true);
    expect(detectTribute('One Night of Queen plays Queen')).toBe(true);
  });
  it('flags "The X Show" ONLY with the famous-artist secondary signal', () => {
    expect(detectTribute('The Doors Show')).toBe(true);
    expect(detectTribute('The Late Night Show')).toBe(false);
  });
});

describe('extractArtists', () => {
  const shows = [
    { id: 'tm:1', startsAt: '2026-07-20T20:00:00', attractions: [{ id: 'a', name: 'BALTHVS' }, { id: 'b', name: 'Khruangbin — A La Sala Tour' }], artistIds: [] },
    { id: 'tm:2', startsAt: '2026-07-22T21:00:00', attractions: [{ id: 'c', name: 'Khruangbin' }], artistIds: [] },
  ] as any[];
  it('keeps every attraction — openers never dropped — and dedupes across events', () => {
    const artists = extractArtists(shows);
    expect(Object.keys(artists).sort()).toEqual(['balthvs', 'khruangbin']);
    expect(artists['khruangbin'].billingSlots).toHaveLength(2);
  });
  it('fills shows[].artistIds in billed order and records slots', () => {
    extractArtists(shows);
    expect(shows[0].artistIds).toEqual(['balthvs', 'khruangbin']);
    expect(shows[0].artistIds.length).toBe(shows[0].attractions.length);
  });
});
