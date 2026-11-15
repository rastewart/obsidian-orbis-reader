// Whether a catalog is allowed to send a request into your own network.
//
// **`requestUrl` is not subject to CORS**, which is why Book sources uses it — a catalog server has no reason to
// have opted this plugin in, so a plain `fetch` fails on exactly the hosts the feature exists to serve. The cost is
// that Orbis can reach `localhost`, `192.168.x.x` and `169.254.169.254`, and can READ the response, where a
// browser's cross-origin fetch would hand back something opaque.
//
// Every browse target and acquisition URL comes from `resolveOpdsHref(feedHref, base)` — the catalog writes them.
// So a hostile feed could publish `http://192.168.1.10:8080/opds`, have Orbis fetch it and render whatever came
// back in the dialog, enumerating a LAN one link at a time.
//
// **The rule is conditional, because the obvious rule breaks the main use case.** A Calibre content server on a LAN
// is the canonical self-hosted OPDS setup; refusing private addresses outright would break it. So:
//
//     A public catalog may not send you into your own network. A private one may talk to itself.
//
// Same insight as the credential anchor next door: compare against the SOURCE, never against the request.
//
// **Known limit, stated rather than papered over: DNS rebinding defeats this.** A public hostname that resolves to
// `192.168.1.10` passes a name-based check, and a renderer cannot resolve DNS to find out. Closing that needs a
// check at the socket, which a plugin does not have. This stops the honest form of the attack.
//
// See docs/design/dependency-security.md.

/** IPv4 in the ranges reserved for private and link-local use, plus loopback. */
function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return false;
  const [a, b] = nums;
  if (a === 127) return true; // loopback, all of 127/8
  if (a === 10) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 169 && b === 254) return true; // link-local, and 169.254.169.254 is the cloud metadata address
  if (a === 100 && b >= 64 && b <= 127) return true; // RFC 6598 shared address space — Tailscale lives here
  if (a === 0) return true; // 0.0.0.0/8, which some stacks route to localhost
  return false;
}

/** `host` in the one spelling the URL parser gives an IPv6 address — compressed, lower case, IPv4 tails in hex — or
 *  as it came when it is not an address the parser accepts. */
function canonicalIpv6(inner: string): string {
  try {
    return new URL(`http://[${inner}]/`).hostname.slice(1, -1);
  } catch {
    return inner.toLowerCase();
  }
}

/** IPv6 loopback, unique-local (`fc00::/7`) and link-local (`fe80::/10`), plus IPv4-mapped and IPv4-compatible forms. */
function isPrivateIpv6(host: string): boolean {
  const inner = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const lower = canonicalIpv6(inner);
  if (lower === '::1' || lower === '::') return true;
  // `::ffff:192.168.1.10` — an IPv4 address wearing an IPv6 coat, and the same network either way. **The URL parser
  // writes it as `::ffff:c0a8:10a`**, which is the form every address from `mayReach` arrives in, so the hex tail is
  // turned back into dotted IPv4 before the IPv4 rules see it. `::c0a8:10a` is the deprecated IPv4-compatible form of
  // the same address, and is read the same way.
  const tail = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (tail) {
    const [hi, lo] = [Number.parseInt(tail[1], 16), Number.parseInt(tail[2], 16)];
    return isPrivateIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  const head = Number.parseInt(lower.split(':')[0] || '0', 16);
  if (Number.isNaN(head)) return false;
  if (head >= 0xfc00 && head <= 0xfdff) return true; // unique-local
  if (head >= 0xfe80 && head <= 0xfebf) return true; // link-local
  return false;
}

/**
 * Whether `host` names something on this machine or this network.
 *
 * Names as well as numbers: `localhost`, anything under `.localhost` or `.local` (mDNS — how a Calibre box on a
 * home network usually answers), and **a bare hostname with no dot at all**, which on a LAN resolves through the
 * local search domain to a machine down the hall.
 */
export function isPrivateHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, '');
  if (!name) return true; // no host at all is not somewhere we are willing to go
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (name.endsWith('.local') || name.endsWith('.internal') || name.endsWith('.home.arpa')) return true;
  if (name.includes(':') || name.startsWith('[')) return isPrivateIpv6(name);
  if (isPrivateIpv4(name)) return true;
  // A single label — `nas`, `calibre` — is resolved against the local search domain, so it is a LAN name.
  return !name.includes('.');
}

/**
 * Whether a request to `target` is allowed on behalf of a source configured as `home`.
 *
 * A private target needs a private source. Everything else — public to public, private to its own network — is
 * allowed, because a catalog legitimately serves covers and acquisitions from hosts it does not own.
 *
 * Unparseable URLs are refused: this answers "may we", and "we cannot tell" is not a yes.
 */
export function mayReach(target: string, home: string): boolean {
  try {
    const to = new URL(target);
    const from = new URL(home);
    if (!isPrivateHost(to.hostname)) return true;
    return isPrivateHost(from.hostname);
  } catch {
    return false;
  }
}
