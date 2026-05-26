export function MapBackdrop({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 500 400"
      preserveAspectRatio="xMidYMid slice"
      className={`absolute inset-0 w-full h-full ${className}`}
      aria-hidden
    >
      {/* Warm cream background */}
      <rect width="500" height="400" fill="#f3ede4" />

      {/* Park blocks */}
      <rect x="20" y="40" width="78" height="56" rx="6" fill="#e1eed5" />
      <rect x="378" y="288" width="92" height="72" rx="6" fill="#dceace" />
      <rect x="278" y="20" width="48" height="28" rx="4" fill="#e6f0d9" />

      {/* Water inlet */}
      <rect x="420" y="40" width="80" height="60" rx="10" fill="#dbe7f0" />

      {/* Horizontal streets */}
      <g fill="#fbf7f1" stroke="#eadfcd" strokeWidth="0.7">
        <rect x="0" y="62" width="500" height="14" />
        <rect x="0" y="130" width="500" height="22" />
        <rect x="0" y="210" width="500" height="14" />
        <rect x="0" y="285" width="500" height="18" />
        <rect x="0" y="360" width="500" height="14" />
      </g>

      {/* Vertical streets */}
      <g fill="#fbf7f1" stroke="#eadfcd" strokeWidth="0.7">
        <rect x="62" y="0" width="14" height="400" />
        <rect x="170" y="0" width="22" height="400" />
        <rect x="270" y="0" width="14" height="400" />
        <rect x="360" y="0" width="20" height="400" />
        <rect x="445" y="0" width="12" height="400" />
      </g>

      {/* Diagonal accent street */}
      <g>
        <line x1="-20" y1="408" x2="520" y2="60" stroke="#fbf7f1" strokeWidth="16" />
        <line x1="-20" y1="408" x2="520" y2="60" stroke="#eadfcd" strokeWidth="0.7" />
      </g>

      {/* Curvy blue route — soft glow under main line */}
      <path
        d="M 230 30 C 200 80, 250 115, 230 160 S 200 220, 240 260 S 250 330, 250 360"
        stroke="#818cf8" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.35"
      />
      <path
        d="M 230 30 C 200 80, 250 115, 230 160 S 200 220, 240 260 S 250 330, 250 360"
        stroke="#4f46e5" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Start dot */}
      <circle cx="230" cy="30" r="6" fill="#4f46e5" stroke="white" strokeWidth="2" />

      {/* Destination pin */}
      <circle cx="250" cy="360" r="11" fill="#4f46e5" stroke="white" strokeWidth="3" />
      <circle cx="250" cy="360" r="3.5" fill="white" />
    </svg>
  );
}
