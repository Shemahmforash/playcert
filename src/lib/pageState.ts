import { parseUrlState, type RequestKey } from './urlState';

export interface PageParams {
  city: string;
  window: string;
  fontStop: string[] | undefined;
}

export type PageState =
  | { kind: 'render'; key: RequestKey }
  | { kind: 'not-found'; reason: 'city' | 'window' | 'fontStop'; cityDefault: string | null };

/**
 * Adapts parseUrlState into a page-render decision. On a bad slug there is no
 * meaningful city to link back to (cityDefault = null); on a bad window/fontStop
 * the slug is valid, so we offer the canonical next-14-days path for that city.
 */
export function resolvePageState(params: PageParams): PageState {
  const result = parseUrlState(params.city, params.window, params.fontStop);
  if (result.ok) return { kind: 'render', key: result.key };
  const cityDefault = result.reason === 'city' ? null : `/${params.city}/next-14-days`;
  return { kind: 'not-found', reason: result.reason, cityDefault };
}
