import "server-only";
import { lookup as dnsLookup } from "node:dns";
import { Agent, fetch } from "undici";
import { checkPublicUrl, isBlockedAddress } from "./address";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

/**
 * Validates every resolved address at connect time, so a hostname can't pass a check and then
 * resolve to an internal address (DNS rebinding).
 */
const guardedAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 0);
        const list = Array.isArray(addresses) ? addresses : [];
        const blocked = list.find((a) => isBlockedAddress(a.address));
        if (!list.length || blocked) {
          return callback(Object.assign(new Error("Refused to connect to a non-public address."), { code: "EBLOCKED" }), "", 0);
        }
        const first = list[0];
        if ((options as { all?: boolean }).all) return (callback as (e: null, a: typeof list) => void)(null, list);
        callback(null, first.address, first.family);
      });
    },
  },
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

export type FetchPageResult = { ok: true; html: string; finalUrl: string } | { ok: false; error: string };

/** Fetches a public product page as text with redirects, size, time and address guards. */
export async function fetchProductPage(link: string): Promise<FetchPageResult> {
  let current = checkPublicUrl(link);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!current.ok) return current;
    let res;
    try {
      res = await fetch(current.url, {
        dispatcher: guardedAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DyeCastBot/1.0; +https://github.com/) shade lookup",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en",
        },
      });
    } catch {
      return { ok: false, error: "We couldn't reach that page." };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) return { ok: false, error: "That page redirected without a destination." };
      current = checkPublicUrl(new URL(location, current.url).toString());
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, error: `That store didn't let us read the page (${res.status}). Type the shade code instead.` };
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) {
      await res.body?.cancel();
      return { ok: false, error: "That link isn't a web page." };
    }
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "The page was empty." };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
      if (size >= MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { ok: true, html, finalUrl: current.url.toString() };
  }
  return { ok: false, error: "That link redirected too many times." };
}
