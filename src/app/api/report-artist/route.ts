import { z } from 'zod';

// The "wrong artist?" report sink (R9). No database: a valid report is a single
// structured server-side log line, from which the wrong-match rate is computed
// off-platform. Fire-and-forget — the client never depends on the response body.
const Body = z.object({
  city: z.string().regex(/^[a-z0-9-]{2,40}$/),
  window: z.enum(['tonight', 'this-weekend', 'next-14-days']),
  artistId: z.string().max(80),
  showId: z.string().max(80),
});

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  console.log(JSON.stringify({ evt: 'wrong-artist', at: new Date().toISOString(), ...parsed.data }));
  return new Response(null, { status: 204 });
}
