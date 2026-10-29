import { cropAlign, HAIR_TEXTURE, isMirrored, SWATCH_H, SWATCH_W, swatchLayers, type Fade, type SwatchInput } from "@/lib/hair/texture";
import { rampTables } from "@/lib/hair/ramp";

interface HairSwatchProps extends SwatchInput {
  label: string;
  className?: string;
}

function idFor(...parts: Array<string | number | undefined>): string {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `hs${(h >>> 0).toString(36)}`;
}

/** A mask that keeps the top of the swatch and fades out across `fade` (or the reverse). */
function FadeMask({ id, fade, invert = false }: { id: string; fade: Fade; invert?: boolean }) {
  return (
    <>
      <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="0" y1={fade.from} x2="0" y2={fade.to}>
        <stop offset="0" stopColor={invert ? "#000" : "#fff"} />
        <stop offset="1" stopColor={invert ? "#fff" : "#000"} />
      </linearGradient>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={SWATCH_W} height={SWATCH_H}>
        <rect width={SWATCH_W} height={SWATCH_H} fill={`url(#${id}-g)`} />
      </mask>
    </>
  );
}

/**
 * A hair swatch made from a real photograph of hair, recolored with a gradient map per color (shadows, the color
 * itself, a paler shine) so every shade keeps real strands and shine. Roots blend into the lengths, and highlight
 * or gray strands follow the photo's own strands. Fills its box from the top, so the roots stay in view.
 * Server-rendered SVG, no client JS.
 */
export function HairSwatch({ label, className, seed, ...input }: HairSwatchProps) {
  const layers = swatchLayers(input);
  const id = idFor(label, input.lengths, input.roots, input.rootsShare, input.streaks?.kind, input.streaks?.hex, input.streaks?.share, seed);
  return (
    <svg
      viewBox={`0 0 ${SWATCH_W} ${SWATCH_H}`}
      role="img"
      aria-label={label}
      className={className ? `hair-swatch ${className}` : "hair-swatch"}
      preserveAspectRatio={`xMid${{ 0: "YMin", 0.5: "YMid", 1: "YMax" }[cropAlign({ roots: input.roots, seed })]} slice`}
    >
      <defs>
        {layers.map((layer, i) => {
          const table = rampTables(layer.hex);
          return (
            <filter key={`f${i}`} id={`${id}-f${i}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="table" tableValues={table.r} />
                <feFuncG type="table" tableValues={table.g} />
                <feFuncB type="table" tableValues={table.b} />
              </feComponentTransfer>
            </filter>
          );
        })}
        {layers.map((layer, i) => layer.roots && <FadeMask key={`r${i}`} id={`${id}-r${i}`} fade={layer.roots} />)}
        {layers.map((layer, i) => layer.belowRoots && <FadeMask key={`b${i}`} id={`${id}-b${i}`} fade={layer.belowRoots} invert />)}
        {layers.map(
          (layer, i) =>
            layer.strands && (
              <mask key={`s${i}`} id={`${id}-s${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width={SWATCH_W} height={SWATCH_H}>
                <image href={layer.strands} width={SWATCH_W} height={SWATCH_H} preserveAspectRatio="none" />
              </mask>
            ),
        )}
      </defs>
      <g transform={isMirrored(seed) ? `translate(${SWATCH_W} 0) scale(-1 1)` : undefined}>
        {layers.map((layer, i) => {
          const mask = layer.roots ? `r${i}` : layer.strands ? `s${i}` : undefined;
          return (
            <g key={i} mask={layer.belowRoots ? `url(#${id}-b${i})` : undefined}>
              <image
                href={HAIR_TEXTURE}
                width={SWATCH_W}
                height={SWATCH_H}
                preserveAspectRatio="none"
                filter={`url(#${id}-f${i})`}
                mask={mask ? `url(#${id}-${mask})` : undefined}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
