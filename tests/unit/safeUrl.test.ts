import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from '../../src/lib/safeUrl';

describe('safeHttpUrl', () => {
  it('passes absolute http(s) URLs through UNCHANGED (utm/query intact)', () => {
    const u = 'https://link.dice.fm/z196523f6dcb?utm_source=jambase';
    expect(safeHttpUrl(u)).toBe(u);
    expect(safeHttpUrl('http://itunes.apple.com/x')).toBe('http://itunes.apple.com/x');
  });

  it('drops javascript: URLs (the XSS vector)', () => {
    expect(safeHttpUrl('javascript:alert(document.cookie)')).toBe('');
    // URL parser strips leading spaces and embedded tabs/newlines from the scheme,
    // so these obfuscations still resolve to javascript: and get dropped.
    expect(safeHttpUrl('  javascript:alert(1)')).toBe('');
    expect(safeHttpUrl('java\tscript:alert(1)')).toBe('');
    expect(safeHttpUrl('JavaScript:alert(1)')).toBe('');
  });

  it('drops data:, blob:, file: and other non-http schemes', () => {
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeHttpUrl('blob:https://evil.example/uuid')).toBe('');
    expect(safeHttpUrl('file:///etc/passwd')).toBe('');
  });

  it('drops relative / protocol-relative / unparseable input', () => {
    expect(safeHttpUrl('//evil.example/x')).toBe('');
    expect(safeHttpUrl('/local/path')).toBe('');
    expect(safeHttpUrl('not a url')).toBe('');
  });

  it('collapses empty / null / undefined to ""', () => {
    expect(safeHttpUrl('')).toBe('');
    expect(safeHttpUrl(null)).toBe('');
    expect(safeHttpUrl(undefined)).toBe('');
  });
});
