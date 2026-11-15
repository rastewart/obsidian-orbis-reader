// Whether a catalog may send a request into your own network.
//
// The rule is conditional on purpose — a Calibre content server on a LAN is the canonical self-hosted OPDS setup,
// so refusing private addresses outright would break the main use case. Half of what these assert is therefore
// that the legitimate case still works, which is the half a stricter rule would have got wrong.

import { describe, expect, it } from 'vitest';
import { isPrivateHost, mayReach } from '../sources/private-hosts';

describe('isPrivateHost', () => {
  it('knows the RFC 1918 ranges', () => {
    expect(isPrivateHost('10.0.0.1')).toBe(true);
    expect(isPrivateHost('192.168.1.10')).toBe(true);
    expect(isPrivateHost('172.16.0.1')).toBe(true);
    expect(isPrivateHost('172.31.255.255')).toBe(true);
    // 172.32 is outside the /12 — a range people get wrong by remembering it as "all of 172".
    expect(isPrivateHost('172.32.0.1')).toBe(false);
    expect(isPrivateHost('172.15.0.1')).toBe(false);
  });

  it('knows loopback and link-local', () => {
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('127.1.2.3')).toBe(true); // all of 127/8, not just .0.1
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('LOCALHOST')).toBe(true);
    expect(isPrivateHost('0.0.0.0')).toBe(true);
  });

  /** `169.254.169.254` is the cloud metadata address — the single most valuable SSRF target there is. */
  it('knows the metadata address', () => {
    expect(isPrivateHost('169.254.169.254')).toBe(true);
    expect(isPrivateHost('169.254.1.1')).toBe(true);
  });

  it('knows the shared address space Tailscale uses', () => {
    expect(isPrivateHost('100.64.0.1')).toBe(true);
    expect(isPrivateHost('100.127.255.255')).toBe(true);
    expect(isPrivateHost('100.128.0.1')).toBe(false); // outside the /10
    expect(isPrivateHost('100.63.0.1')).toBe(false);
  });

  it('knows IPv6 loopback, unique-local and link-local', () => {
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('[::1]')).toBe(true);
    expect(isPrivateHost('fd00::1')).toBe(true);
    expect(isPrivateHost('fe80::1')).toBe(true);
    expect(isPrivateHost('2606:4700::1111')).toBe(false); // a real public address
  });

  /** An IPv4 address wearing an IPv6 coat is the same machine either way. */
  it('sees through an IPv4-mapped address', () => {
    expect(isPrivateHost('::ffff:192.168.1.10')).toBe(true);
    expect(isPrivateHost('[::ffff:10.0.0.1]')).toBe(true);
    expect(isPrivateHost('::ffff:8.8.8.8')).toBe(false);
  });

  /** How a box on a home network actually answers, and how a single label resolves through a search domain. */
  it('knows LAN names, not just LAN numbers', () => {
    expect(isPrivateHost('calibre.local')).toBe(true);
    expect(isPrivateHost('nas')).toBe(true);
    expect(isPrivateHost('printer.home.arpa')).toBe(true);
    expect(isPrivateHost('api.internal')).toBe(true);
  });

  it('leaves the public internet alone', () => {
    expect(isPrivateHost('www.gutenberg.org')).toBe(false);
    expect(isPrivateHost('standardebooks.org')).toBe(false);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    // A name that merely CONTAINS a private-looking string is public.
    expect(isPrivateHost('localhost.attacker.example')).toBe(false);
    expect(isPrivateHost('192.168.1.10.attacker.example')).toBe(false);
  });
});

describe('mayReach', () => {
  const GUTENBERG = 'https://www.gutenberg.org/ebooks/search.opds/';
  const CALIBRE = 'http://192.168.1.10:8080/opds';

  /** The attack: a catalog on the public internet publishing a link into your house. */
  it('refuses a public catalog reaching into a private network', () => {
    expect(mayReach('http://192.168.1.10:8080/opds', GUTENBERG)).toBe(false);
    expect(mayReach('http://localhost:8080/admin', GUTENBERG)).toBe(false);
    expect(mayReach('http://169.254.169.254/latest/meta-data/', GUTENBERG)).toBe(false);
    expect(mayReach('http://nas/files', GUTENBERG)).toBe(false);
  });

  /** Through `mayReach`, not `isPrivateHost`: the URL parser rewrites `[::ffff:192.168.1.10]` as `[::ffff:c0a8:10a]`,
   *  so a check that only knows the dotted spelling never sees the address it was written to catch. */
  it('refuses an IPv4 address written as IPv6, in every spelling the URL parser leaves', () => {
    expect(mayReach('http://[::ffff:192.168.1.10]:8080/opds', GUTENBERG)).toBe(false);
    expect(mayReach('http://[::ffff:127.0.0.1]/admin', GUTENBERG)).toBe(false);
    expect(mayReach('http://[0:0:0:0:0:ffff:a9fe:a9fe]/latest/meta-data/', GUTENBERG)).toBe(false);
    expect(mayReach('http://[::ffff:c0a8:10a]/', GUTENBERG)).toBe(false);
    expect(mayReach('http://[::7f00:1]/', GUTENBERG)).toBe(false); // the deprecated IPv4-compatible form
    expect(mayReach('http://[::ffff:8.8.8.8]/', GUTENBERG)).toBe(true); // still a public machine
  });

  /** The legitimate case, and the reason the rule is conditional rather than absolute. */
  it('lets a private catalog talk to itself', () => {
    expect(mayReach('http://192.168.1.10:8080/get/EPUB/42/library', CALIBRE)).toBe(true);
    expect(mayReach('http://192.168.1.10:8080/opds/browse?page=2', CALIBRE)).toBe(true);
    expect(mayReach('http://localhost:8080/opds', 'http://localhost:8080/opds')).toBe(true);
    expect(mayReach('http://calibre.local/opds', 'http://calibre.local/opds')).toBe(true);
  });

  /** A LAN source reaching another LAN box is allowed: it is already inside, and a Calibre box redirecting to a
   *  file server on the same network is a plausible setup rather than an attack. */
  it('lets a private catalog reach another private host', () => {
    expect(mayReach('http://192.168.1.20/files/a.epub', CALIBRE)).toBe(true);
  });

  /** Public to public is untouched — Gutenberg serves acquisitions and covers off its own host, and blocking that
   *  was the thing this rule was designed NOT to do. */
  it('leaves public catalogs working across hosts', () => {
    expect(mayReach('https://cdn.gutenberg.example/2701.epub', GUTENBERG)).toBe(true);
    expect(mayReach('https://mirror.example/opds', GUTENBERG)).toBe(true);
  });

  it('refuses what it cannot parse, because "we cannot tell" is not a yes', () => {
    expect(mayReach('http://[bad', GUTENBERG)).toBe(false);
    expect(mayReach('not a url', GUTENBERG)).toBe(false);
    expect(mayReach(GUTENBERG, 'not a url')).toBe(false);
  });
});
