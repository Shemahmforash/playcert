import { describe, it, expect } from 'vitest';
import { resolvePageState } from '../../src/lib/pageState';
describe('resolvePageState', () => {
  it('valid → render', () => {
    expect(resolvePageState({ city:'lisbon', window:'tonight', fontStop:['no-arenas'] }))
      .toEqual({ kind:'render', key:{ city:'lisbon', window:'tonight', fontStop:'no-arenas' } });
  });
  it('bad window → not-found + link', () => {
    expect(resolvePageState({ city:'lisbon', window:'next-30-days', fontStop:undefined }))
      .toEqual({ kind:'not-found', reason:'window', cityDefault:'/lisbon/next-14-days' });
  });
  it('bad fontStop → not-found', () => {
    expect(resolvePageState({ city:'lisbon', window:'tonight', fontStop:['x'] }).kind).toBe('not-found');
  });
  it('bad slug → not-found, no link', () => {
    expect(resolvePageState({ city:'LISBON!', window:'tonight', fontStop:undefined }))
      .toEqual({ kind:'not-found', reason:'city', cityDefault:null });
  });
});
