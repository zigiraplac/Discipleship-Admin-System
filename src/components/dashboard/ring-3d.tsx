/**
 * A shared "give this ring some depth" wrapper for the two Dashboard
 * donuts — a soft silhouette-following drop shadow (via CSS `filter`, so it
 * follows the ring's actual circular shape rather than a rectangular box-
 * shadow) plus a glossy highlight overlay, the classic 3D-pie-chart shading
 * trick rather than a literal perspective tilt. A true `rotateX` tilt would
 * also skew the centered percentage text and make it harder to read, which
 * defeats the point of a "glance" chart — this keeps every number flat and
 * legible while still reading as a raised, dimensional disc.
 *
 * The shadow reads `--shadow-ring` (globals.css), which gets a dedicated,
 * more opaque dark-mode value — the light-mode shadow is a dark, low-
 * opacity tint that would be invisible against a near-black dark-theme
 * card, so it can't just be reused as-is.
 *
 * Deliberately not folded into `CompletionRing` itself (ui/completion-
 * ring.tsx) — that primitive is also used by the plain, flat ring on the
 * Cohorts page (cohorts/cohort-card.tsx), which nobody asked to restyle.
 */
export function Ring3D({
  size,
  glossy = true,
  children,
}: {
  size: number;
  /** The highlight gradient overlay — off for the Cohort status donut,
   * whose flat segment colors need to stay true (the gloss washed out the
   * "Not started"/grey segment especially). The drop shadow stays either
   * way. */
  glossy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex-none"
      style={{ width: size, height: size, filter: "drop-shadow(var(--shadow-ring))" }}
    >
      {children}
      {glossy && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.6), transparent 55%)" }}
        />
      )}
    </div>
  );
}
