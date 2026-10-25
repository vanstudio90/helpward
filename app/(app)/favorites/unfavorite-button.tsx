"use client";

import { useTransition, useState } from "react";
import { HeartOff } from "lucide-react";
import { toggleFavoriteAction } from "./actions";

// Remove control for a saved service. The Favorites page previously rendered
// saved services as static text, so the only way to unsave one was to go
// find its card in the catalog and click the heart again (HW-14).
export function UnfavoriteServiceButton({ serviceId, title }: { serviceId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) {
    return <span className="text-[11px] text-slate-400 px-1">Removed</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${title} from favorites`}
      onClick={() =>
        startTransition(async () => {
          const r = await toggleFavoriteAction("service", serviceId);
          // revalidatePath in the action re-renders the list; the local flag
          // just stops this row looking interactive in the meantime.
          if (!("error" in r)) setRemoved(true);
        })
      }
      className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 px-2 py-1.5 rounded-lg disabled:opacity-50"
    >
      <HeartOff className="w-3 h-3" /> Remove
    </button>
  );
}
