import { findShadeCandidates, type ShadeCandidate } from "@/lib/engine/shade-code";
import type { ProductType } from "@/lib/engine/types";

export interface ProductInfo {
  title?: string;
  brand?: string;
  color?: string;
  /** Text the shade code was searched in, most specific first. */
  sources: string[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function clean(text: string | undefined): string | undefined {
  const t = text && decodeEntities(text).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : undefined;
}

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  return tag ? clean(/content=["']([^"']*)["']/i.exec(tag)?.[1]) : undefined;
}

interface JsonLdProduct {
  name?: string;
  brand?: string | { name?: string };
  color?: string;
  sku?: string;
}

function findProduct(node: unknown): JsonLdProduct | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProduct(item);
      if (found) return found;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return obj as JsonLdProduct;
  return findProduct(obj["@graph"]);
}

function jsonLdProduct(html: string): JsonLdProduct | undefined {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m; (m = re.exec(html)); ) {
    try {
      const found = findProduct(JSON.parse(m[1]));
      if (found) return found;
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return undefined;
}

/** Pulls product name, brand and color from a product page without executing it. */
export function extractProductInfo(html: string, pageUrl: string): ProductInfo {
  const product = jsonLdProduct(html);
  const brand = clean(typeof product?.brand === "string" ? product.brand : product?.brand?.name) ?? metaContent(html, "product:brand");
  const title = clean(product?.name) ?? metaContent(html, "og:title") ?? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  const color = clean(product?.color) ?? metaContent(html, "product:color");
  const h1 = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]);
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");
  const sources = [color, title, h1, slugText(pageUrl), description].filter((s): s is string => Boolean(s));
  return { title, brand, color, sources };
}

/** Readable words from a URL path, e.g. "/excellence-creme-7-1-medium-ash-blonde" → "excellence creme 7.1 medium ash blonde". */
export function slugText(pageUrl: string): string | undefined {
  try {
    const path = decodeURIComponent(new URL(pageUrl).pathname);
    const text = path
      .replace(/\.[a-z]{2,5}$/i, "")
      .replace(/(\d)[-_](\d)(?!\d)/g, "$1.$2")
      .replace(/[/_+-]+/g, " ")
      // Slugs are lowercase: "6g" here is shade 6G, not 6 grams.
      .replace(/\b(\d{1,2})([a-z]{1,3})\b/g, (_, digits: string, letters: string) => `${digits}${letters.toUpperCase()}`)
      .trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

const PRODUCT_WORDS: Array<[RegExp, ProductType]> = [
  [/\bsemi[- ]?permanent\b/i, "semi"],
  [/\bdemi[- ]?permanent\b|\btoner\b|\bgloss\b|\bglaze\b/i, "demi"],
  [/high[- ]?lift|super[- ]?lift|ultra[- ]?lift/i, "high-lift"],
  [/\bpermanent\b/i, "permanent"],
];

export function productTypeHint(texts: string[]): ProductType | undefined {
  const all = texts.join(" ");
  return PRODUCT_WORDS.find(([re]) => re.test(all))?.[1];
}

/** Best shade candidates across all sources, preferring the most specific source. */
export function shadeCandidatesFrom(info: ProductInfo): ShadeCandidate[] {
  const seen = new Map<string, ShadeCandidate>();
  info.sources.forEach((source, rank) => {
    for (const c of findShadeCandidates(source)) {
      const scored = { ...c, score: c.score - rank * 0.4 };
      const prev = seen.get(c.shade.code);
      if (!prev || prev.score < scored.score) seen.set(c.shade.code, scored);
    }
  });
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 4);
}
