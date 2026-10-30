import { isIP } from "node:net";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function inV4Block(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/** The eight 16-bit groups of a valid IPv6 address (also when it ends in dotted IPv4), or null. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.replace(/%.*$/, "");
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    const n = ipv4ToInt(dotted[1]);
    text = `${text.slice(0, dotted.index)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groupsOf = (s: string) => (s ? s.split(":") : []);
  const left = groupsOf(halves[0]);
  const right = halves.length === 2 ? groupsOf(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0 || (halves.length === 1 && left.length !== 8)) return null;
  const groups = [...left, ...Array<string>(fill).fill("0"), ...right].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

/**
 * Non-public IPv6 ranges. Addresses that carry an IPv4 address (mapped, compatible, NAT64, 6to4, Teredo) are judged
 * by it or refused, because URL parsing writes them in hex (http://[::ffff:127.0.0.1]/ becomes [::ffff:7f00:1]).
 */
function ipv6Blocked(g: number[]): boolean {
  const [a, b] = g;
  if (g.slice(0, 5).every((x) => x === 0)) {
    // ::, ::1 and IPv4-compatible addresses are refused; an IPv4-mapped one is judged by its IPv4 address.
    if (g[5] !== 0xffff) return true;
    return inV4Block([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join("."));
  }
  if (a === 0x64 && b === 0xff9b) return true; // NAT64 (64:ff9b::/96, 64:ff9b:1::/48)
  if (a === 0x2002) return true; // 6to4
  if (a === 0x2001 && (b === 0 || b === 0xdb8)) return true; // Teredo, documentation
  if (a === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only 100::/64
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0) return true; // link local, old site local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** True for loopback, private, link-local, CGNAT, multicast, documentation and other non-public addresses. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(ip);
  if (family === 4) return inV4Block(ip);
  if (family !== 6) return true;
  const groups = ipv6Groups(ip);
  return groups === null || ipv6Blocked(groups);
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

export function checkPublicUrl(value: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, error: "That doesn't look like a web link." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Use an http(s) product link." };
  if (url.username || url.password) return { ok: false, error: "Links with credentials aren't allowed." };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, error: "That link uses an unusual port." };
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "That link isn't a public website." };
  }
  if (isIP(host.replace(/^\[|\]$/g, "")) && isBlockedAddress(host)) return { ok: false, error: "That link isn't a public website." };
  return { ok: true, url };
}
