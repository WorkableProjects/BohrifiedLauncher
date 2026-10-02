import { describe, expect, it } from 'vitest';
import { SESSION_ALPHABET, isJoinMessage, isLocalHost, joinPath, liveBackend, localJoinUrl, newSessionCode, normalizeSessionCode, parseJoinInput, relayUrl, sessionSocketUrl } from './live';

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
  const site = 'https://bohrified.netlify.app';
  const hosted = { dev: false, origin: site, protocol: 'https:', hostname: 'bohrified.netlify.app', onlineSite: site };
  const laptop = { dev: true, origin: 'http://localhost:5173', protocol: 'http:', hostname: 'localhost', onlineSite: site };

  it('uses the hosted site by default, from anywhere', () => {
    expect(liveBackend('', hosted)).toEqual({ kind: 'http', url: `${site}/api/live` });
    expect(liveBackend(undefined, laptop)).toEqual({ kind: 'http', url: `${site}/api/live` });
    expect(liveBackend(undefined, { ...laptop, hostname: '192.168.1.20' })).toEqual({ kind: 'http', url: `${site}/api/live` });
  });
  it('local mode uses this computer: the dev relay on the page host, or the page own /api/live', () => {
    expect(liveBackend(undefined, { ...laptop, mode: 'local' })).toEqual({ kind: 'ws', url: 'ws://localhost:8787' });
    expect(liveBackend(undefined, { ...laptop, mode: 'local', hostname: '192.168.1.20' })).toEqual({ kind: 'ws', url: 'ws://192.168.1.20:8787' });
    expect(liveBackend(undefined, { dev: false, origin: 'http://192.168.1.20:8787', protocol: 'http:', hostname: '192.168.1.20', mode: 'local', onlineSite: site })).toEqual({ kind: 'http', url: 'http://192.168.1.20:8787/api/live' });
  });
  it('honours an explicit relay or endpoint', () => {
    expect(liveBackend('wss://live.example/', hosted)).toEqual({ kind: 'ws', url: 'wss://live.example' });
    expect(liveBackend('https://live.example/api/live/', hosted)).toEqual({ kind: 'http', url: 'https://live.example/api/live' });
    expect(liveBackend('http://localhost:8787', hosted)).toEqual({ kind: 'http', url: 'http://localhost:8787' });
  });
  it('rejects unusable addresses', () => {
    expect(liveBackend('ws://live.example', hosted)).toBeNull();
    expect(liveBackend('http://live.example', hosted)).toBeNull();
    expect(liveBackend('ftp://x', hosted)).toBeNull();
    expect(liveBackend('nonsense', hosted)).toBeNull();
  });
});

describe('isLocalHost', () => {
  it('recognises own-computer and private-network hosts', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', '192.168.0.5', '10.1.2.3', '172.20.0.1', '172.31.255.1', '169.254.1.1', 'laptop.local']) expect(isLocalHost(h)).toBe(true);
    for (const h of ['bohrified.netlify.app', '8.8.8.8', '172.32.0.1', '', undefined]) expect(isLocalHost(h)).toBe(false);
  });
});

describe('localJoinUrl', () => {
  it('builds the address a joiner opens', () => {
    expect(localJoinUrl('192.168.1.20', '8787', 'k7q-x2m')).toBe('http://192.168.1.20:8787/join/K7QX2M?via=local');
    expect(localJoinUrl('http://192.168.1.20:5173/', '', 'K7QX2M')).toBe('http://192.168.1.20/join/K7QX2M?via=local');
    expect(localJoinUrl('laptop.local', '80', 'K7QX2M')).toBe('http://laptop.local/join/K7QX2M?via=local');
  });
  it('rejects bad input', () => {
    expect(localJoinUrl('', '8787', 'K7QX2M')).toBeNull();
    expect(localJoinUrl('192.168.1.20', '99999', 'K7QX2M')).toBeNull();
    expect(localJoinUrl('192.168.1.20', 'abc', 'K7QX2M')).toBeNull();
    expect(localJoinUrl('192.168.1.20', '8787', 'nope')).toBeNull();
    expect(localJoinUrl('bad host!', '8787', 'K7QX2M')).toBeNull();
  });
});
