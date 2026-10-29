/* The map a waiting helper looks at.
 *
 * Deliberately not a real map. Showing an actual map centred on the
 * helper's position costs a Mapbox load per page view on a screen that
 * can sit open for an hour, and it tells them something they already
 * know — where they are. What it needs to say is "the system is looking
 * around you", which is a mood, not a location.
 *
 * So: streets, blocks and parks, stylised in the brand hue. It reads as
 * a map at a glance and claims nothing specific.
 */
export function WaitingMap({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={`absolute inset-0 w-full h-full ${className}`}
      aria-hidden="true"
    >
      <rect width="400" height="300" fill="#efecfb" />

      {/* Parks. Two, off-centre, so the grid does not read as wallpaper. */}
      <rect x="18" y="26" width="74" height="52" rx="8" fill="#dcecd8" />
      <rect x="300" y="196" width="86" height="66" rx="8" fill="#dcecd8" />
      <rect x="236" y="14" width="42" height="26" rx="6" fill="#e3f0df" />

      {/* Blocks, a shade darker than the ground so the streets read as
          gaps between buildings rather than lines drawn on top. */}
      <g fill="#e5e0f7">
        <rect x="110" y="26" width="104" height="52" rx="6" />
        <rect x="18" y="98" width="74" height="76" rx="6" />
        <rect x="110" y="98" width="104" height="76" rx="6" />
        <rect x="232" y="98" width="68" height="76" rx="6" />
        <rect x="318" y="98" width="68" height="76" rx="6" />
        <rect x="18" y="196" width="74" height="66" rx="6" />
        <rect x="110" y="196" width="104" height="66" rx="6" />
        <rect x="232" y="196" width="50" height="66" rx="6" />
        <rect x="296" y="26" width="90" height="52" rx="6" />
      </g>

      {/* Streets, white, with one wider avenue on each axis — an even
          grid looks like graph paper, not a town. */}
      <g stroke="#ffffff" strokeLinecap="round" fill="none">
        <path d="M0 88 H400" strokeWidth="13" />
        <path d="M0 185 H400" strokeWidth="9" />
        <path d="M0 272 H400" strokeWidth="9" />
        <path d="M101 0 V300" strokeWidth="9" />
        <path d="M223 0 V300" strokeWidth="13" />
        <path d="M309 0 V300" strokeWidth="9" />
      </g>

      {/* A diagonal. Every city has one, and it stops the grid from
          reading as a texture. */}
      <path d="M-20 300 L420 -20" stroke="#ffffff" strokeWidth="10" fill="none" opacity="0.85" />
    </svg>
  );
}
