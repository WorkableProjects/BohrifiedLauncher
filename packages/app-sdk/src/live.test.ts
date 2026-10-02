import { describe, expect, it } from 'vitest';
import { SESSION_ALPHABET, isJoinMessage, joinPath, liveBackend, newSessionCode, normalizeSessionCode, parseJoinInput, relayUrl, sessionSocketUrl } from './live';

describe('session codes', () => {
  it('generates six unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const c = newSessionCode();
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      expect(c).not.toMatch(/[ILO01]/);
    }
  });
  it('maps random bytes onto the alphabet', () => {
    expect(newSessionCode(() => new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe('ABCDEF');
    expect(newSessionCode(() => new Uint8Array(6).fill(255))).toHaveLength(6);
    expect([...newSessionCode(() => new Uint8Array(6).fill(255))].every((c) => SESSION_ALPHABET.includes(c))).toBe(true);
  });
  it('normalizes typed codes and rejects bad ones', () => {
    expect(normalizeSessionCode('k7q-x2m')).toBe('K7QX2M');
    expect(normalizeSessionCode(' k7q x2m ')).toBe('K7QX2M');
    expect(normalizeSessionCode('K7QX2')).toBeNull();
    expect(normalizeSessionCode('K7QX2M9')).toBeNull();
    expect(normalizeSessionCode('K7QX20')).toBeNull(); // 0 is not in the alphabet
    expect(normalizeSessionCode('')).toBeNull();
  });
});

describe('join input', () => {
  it('accepts codes and links', () => {
    expect(parseJoinInput('K7QX2M')).toBe('K7QX2M');
    expect(parseJoinInput('https://bohrified.example/join/k7qx2m')).toBe('K7QX2M');
    expect(parseJoinInput('/join/K7QX2M?x=1')).toBe('K7QX2M');
    expect(parseJoinInput('https://bohrified.example/join?code=K7QX2M')).toBe('K7QX2M');
  });
  it('rejects anything else', () => {
    for (const bad of ['', '   ', 'hello', 'https://example.com/other', '/join/NOPE', '/join/']) expect(parseJoinInput(bad)).toBeNull();
  });
  it('builds join links under the deployment base', () => {
    expect(joinPath('/', 'K7QX2M')).toBe('/join/K7QX2M');
    expect(joinPath('/sub', 'K7QX2M')).toBe('/sub/join/K7QX2M');
  });
});

describe('relay configuration', () => {
  it('accepts ws and wss and tidies the address', () => {
    expect(relayUrl('wss://live.example.com/')).toBe('wss://live.example.com');
    expect(relayUrl('wss://live.example.com/relay?x=1#y')).toBe('wss://live.example.com/relay');
    expect(relayUrl('ws://localhost:8787', 'http:')).toBe('ws://localhost:8787');
  });
  it('rejects unsafe or malformed values', () => {
    expect(relayUrl(undefined)).toBeNull();
    expect(relayUrl('')).toBeNull();
    expect(relayUrl('https://live.example.com')).toBeNull();
    expect(relayUrl('javascript:alert(1)')).toBeNull();
    expect(relayUrl('not a url')).toBeNull();
    // An https page may not use plain ws: to a remote host, but localhost is fine for development.
    expect(relayUrl('ws://live.example.com', 'https:')).toBeNull();
    expect(relayUrl('ws://localhost:8787', 'https:')).toBe('ws://localhost:8787');
  });
  it('builds the per-session socket address', () => {
    const u = new URL(sessionSocketUrl('wss://live.example.com', 'K7QX2M', 'tutor', 'abc'));
    expect(u.pathname).toBe('/session/K7QX2M');
    expect(u.searchParams.get('role')).toBe('tutor');
    expect(u.searchParams.get('key')).toBe('abc');
    expect(new URL(sessionSocketUrl('wss://h', 'K7QX2M', 'student')).searchParams.has('key')).toBe(false);
  });
});

describe('join messages', () => {
  it('recognizes only well-formed messages', () => {
    expect(isJoinMessage({ bohrJoin: 1, state: 'live' })).toBe(true);
    expect(isJoinMessage({ bohr: 1, type: 'ready' })).toBe(false);
    expect(isJoinMessage(null)).toBe(false);
    expect(isJoinMessage({ bohrJoin: 1 })).toBe(false);
  });
});

describe('liveBackend', () => {
  const prod = { dev: false, origin: 'https://bohrified.netlify.app', protocol: 'https:' };
  it('uses the local relay in development and the site function in production', () => {
    expect(liveBackend(undefined, { dev: true, origin: 'http://localhost:5173', protocol: 'http:' })).toEqual({ kind: 'ws', url: 'ws://localhost:8787' });
    expect(liveBackend('', prod)).toEqual({ kind: 'http', url: 'https://bohrified.netlify.app/api/live' });
  });
  it('honours an explicit relay or endpoint', () => {
    expect(liveBackend('wss://live.example/', prod)).toEqual({ kind: 'ws', url: 'wss://live.example' });
    expect(liveBackend('https://live.example/api/live/', prod)).toEqual({ kind: 'http', url: 'https://live.example/api/live' });
    expect(liveBackend('http://localhost:8787', { ...prod, protocol: 'https:' })).toEqual({ kind: 'http', url: 'http://localhost:8787' });
  });
  it('rejects unusable addresses', () => {
    expect(liveBackend('ws://live.example', prod)).toBeNull();
    expect(liveBackend('http://live.example', prod)).toBeNull();
    expect(liveBackend('ftp://x', prod)).toBeNull();
    expect(liveBackend('nonsense', prod)).toBeNull();
  });
});
