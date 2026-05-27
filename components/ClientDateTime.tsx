"use client";

import { useEffect, useState } from "react";

// Renders a timestamp formatted in the user's browser timezone. Server SSR
// would otherwise format with Vercel's UTC, showing wrong times.
// Falls back to a slim placeholder pre-hydration so the layout doesn't jump.
export function ClientDateTime({
  iso, mode = "datetime", className,
}: {
  iso: string | null | undefined;
  mode?: "datetime" | "date" | "time";
  className?: string;
}) {
  const [text, setText] = useState<string>(iso ? "…" : "—");

  useEffect(() => {
    if (!iso) {
      setText("—");
      return;
    }
    const d = new Date(iso);
    if (mode === "date") setText(d.toLocaleDateString());
    else if (mode === "time") setText(d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    else setText(d.toLocaleString());
  }, [iso, mode]);

  return (
    <time dateTime={iso ?? undefined} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
