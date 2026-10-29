import { ExternalLink } from "lucide-react";
import type { BoxMatch } from "@/lib/engine/retail";

/** Real boxes for a route step, each linked to the brand or retailer page where it was checked. */
export function BoxList({ boxes, title = "Boxes to look for", compact = false }: {
  boxes: BoxMatch[];
  title?: string;
  compact?: boolean;
}) {
  if (!boxes.length) return null;
  return (
    <div className={`box-list${compact ? " compact" : ""}`}>
      <p className="box-list-title">{title}</p>
      <ul>
        {boxes.map((b) => (
          <li key={`${b.brand}|${b.line}|${b.code}|${b.markets.join()}`}>
            <a href={b.sourceUrl} target="_blank" rel="noreferrer nofollow">
              <strong>{b.brand} {b.line} {b.code}</strong> <span>{b.name}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
            {!compact && (
              <small>
                {b.exact ? "Same level and tone" : "Same level, close tone"} · {b.markets.join(", ")} · checked on {b.source}
              </small>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const BOX_SOURCES_NOTE =
  "Real shades, each checked on the brand's or a retailer's site in October 2026. Not sponsored. Ranges change, so match the level and tone on the box you buy.";
