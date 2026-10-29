import Image from "next/image";
import { cn } from "@/lib/cn";

/* The one place the Helpward mark is drawn.
 *
 * It used to be hand-drawn in fifteen files as a rounded square with the
 * letter H in it — and they had already drifted: the helper sidebar was
 * emerald and the admin one rose, so two of the fifteen were not the
 * brand at all. Replacing the artwork meant editing fifteen files and
 * finding all fifteen; now it means editing this one.
 *
 * `tone="light"` is the white glyph for dark grounds. The purple mark on
 * the near-black footer sits around 2:1 against it — readable as a shape,
 * wrong as a logo — so the two variants are separate artwork rather than
 * a CSS filter, which would soften the edges.
 */

const SRC = {
  brand: "/logo-512.png",
  light: "/logo-white-512.png",
} as const;

export function Logo({
  size = 32,
  tone = "brand",
  withWordmark = false,
  className,
  wordmarkClassName,
}: {
  size?: number;
  tone?: keyof typeof SRC;
  withWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  const mark = (
    <Image
      src={SRC[tone]}
      alt={withWordmark ? "" : "Helpward"}
      width={size}
      height={size}
      // The mark is in the header of every page, so it must not arrive
      // late and shove the nav sideways.
      priority
      className={cn("shrink-0", className)}
    />
  );

  if (!withWordmark) return mark;
  return (
    <span className="inline-flex items-center gap-2">
      {mark}
      <span className={cn("font-extrabold tracking-tight", wordmarkClassName)}>Helpward</span>
    </span>
  );
}
