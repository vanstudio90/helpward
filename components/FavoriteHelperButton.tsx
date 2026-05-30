"use client";

import { useState, useTransition } from "react";
import { Heart, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { toggleFavoriteAction } from "@/app/(app)/favorites/actions";

// Tap to star/un-star a helper. Persists via the existing `favorites` table
// with kind='provider'. Unauthed taps bounce through /signup with a
// next-param so the user lands back on the same profile after auth.
export function FavoriteHelperButton({
  helperId,
  initialSaved,
  isAuthed,
  signupNext,
  size = "md",
  variant = "icon",
}: {
  helperId: string;
  initialSaved: boolean;
  isAuthed: boolean;
  signupNext: string;
  size?: "sm" | "md";
  variant?: "icon" | "pill";
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, start] = useTransition();
  const router = useRouter();

  const onClick = () => {
    if (!isAuthed) {
      router.push(`/signup?next=${encodeURIComponent(signupNext)}`);
      return;
    }
    const prev = saved;
    setSaved(!prev);
    start(async () => {
      const r = await toggleFavoriteAction("provider", helperId);
      if ("error" in r) {
        setSaved(prev);
      } else {
        setSaved(r.saved);
      }
    });
  };

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition disabled:opacity-60",
          saved
            ? "bg-rose-50 text-rose-700 border-rose-200"
            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
        )}
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Heart className={cn("w-3.5 h-3.5", saved && "fill-current")} />
        )}
        {saved ? "Saved" : "Save helper"}
      </button>
    );
  }

  const dim = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const icon = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Remove from favorites" : "Save as favorite"}
      title={saved ? "Saved" : "Save as favorite"}
      className={cn(
        dim,
        "rounded-full inline-flex items-center justify-center border transition disabled:opacity-60",
        saved
          ? "bg-rose-50 text-rose-600 border-rose-200"
          : "bg-white text-slate-500 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200",
      )}
    >
      {pending ? (
        <Loader2 className={cn(icon, "animate-spin")} />
      ) : (
        <Heart className={cn(icon, saved && "fill-current")} />
      )}
    </button>
  );
}
