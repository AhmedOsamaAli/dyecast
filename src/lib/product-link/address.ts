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

/** True for loopback, private, link-local, CGNAT, multicast, documentation and other non-public addresses. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(ip);
  if (family === 4) return inV4Block(ip);
  if (family !== 6) return true;
  if (ip === "::" || ip === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return inV4Block(mapped[1]);
  const first = parseInt(ip.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (ip.startsWith("2001:db8:")) return true; // documentation
  if (ip.startsWith("64:ff9b:")) return true; // NAT64
  return false;
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
