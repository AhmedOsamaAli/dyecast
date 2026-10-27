import { describe, expect, it } from "vitest";
import { checkPublicUrl, isBlockedAddress } from "../address";
import { extractProductInfo, productTypeHint, shadeCandidatesFrom, slugText } from "../extract";

describe("SSRF address guard", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "::", "fe80::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "151.101.1.69", "2606:4700:4700::1111"])("allows public %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("rejects non-web, credentialed, odd-port and internal URLs", () => {
    for (const bad of ["ftp://example.com/x", "javascript:alert(1)", "https://user:pw@example.com", "http://example.com:8080/x",
      "http://localhost/admin", "http://printer.local/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "nonsense"]) {
      expect(checkPublicUrl(bad).ok).toBe(false);
    }
    expect(checkPublicUrl("https://www.example-shop.com/p/excellence-7-1").ok).toBe(true);
  });
});

const PAGE = `<!doctype html><html><head>
<title>Excellence Creme Permanent Hair Color | Shop</title>
<meta property="og:title" content="L&#39;Or&eacute;al Paris Excellence Cr&egrave;me, 7.1 Dark Ash Blonde">
<meta name="description" content="Permanent hair color, 100% gray coverage. 1.7 fl oz.">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},
{"@type":"Product","name":"Excellence Creme 7.1 Dark Ash Blonde","brand":{"@type":"Brand","name":"L'Oréal Paris"},"color":"7.1 Dark Ash Blonde"}]}</script>
</head><body><h1>Excellence Creme</h1></body></html>`;

describe("product page extraction", () => {
  it("reads JSON-LD product data and ranks the real shade code first", () => {
    const info = extractProductInfo(PAGE, "https://shop.example.com/p/excellence-creme-7-1");
    expect(info).toMatchObject({ title: "Excellence Creme 7.1 Dark Ash Blonde", brand: "L'Oréal Paris", color: "7.1 Dark Ash Blonde" });
    const candidates = shadeCandidatesFrom(info);
    expect(candidates[0].shade.code).toBe("7.1");
    expect(candidates.some((c) => c.shade.code === "1.7")).toBe(false);
    expect(productTypeHint(info.sources)).toBe("permanent");
  });

  it("falls back to the URL slug when the page has no data", () => {
    expect(slugText("https://shop.example.com/products/nutrisse-6-3-light-golden-brown.html")).toBe("products nutrisse 6.3 light golden brown");
    const info = extractProductInfo("<html><head><title>Shop</title></head></html>", "https://shop.example.com/products/clairol-nice-n-easy-6g");
    expect(shadeCandidatesFrom(info)[0].shade.code).toBe("6G");
  });

  it("detects toners and demi-permanent products", () => {
    expect(productTypeHint(["Wella Color Charm Demi-Permanent Toner T18"])).toBe("demi");
    expect(productTypeHint(["High Lift Blonde 12.1"])).toBe("high-lift");
  });
});
