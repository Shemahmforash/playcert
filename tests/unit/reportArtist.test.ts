import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '../../src/app/api/report-artist/route';

afterEach(() => vi.restoreAllMocks());

const req = (body: unknown) =>
  new Request('http://x/api/report-artist', { method: 'POST', body: JSON.stringify(body) });

describe('POST /api/report-artist', () => {
  it('valid body → 204 and one structured log line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(req({ city: 'lisbon', window: 'next-14-days', artistId: 'balthvs', showId: 'tm:1' }));
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(log.mock.calls[0][0] as string);
    expect(line).toMatchObject({ evt: 'wrong-artist', city: 'lisbon', artistId: 'balthvs' });
  });

  it('junk body → 400, nothing logged', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(req({ nope: true }));
    expect(res.status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
});
