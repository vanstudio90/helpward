import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/* The helper app's shared furniture.
 *
 * Every provider screen was built on its own: four different card
 * radiuses, three greys for secondary text, section headings that were
 * sometimes bold-14 and sometimes uppercase-11, and two of the sidebars
 * rendering the mark in the wrong colour entirely. It read as five
 * products wearing one name.
 *
 * These are the pieces the screens are made of. Importing one is how a
 * page gets the right spacing and weight; getting it wrong now requires
 * deliberately not using them.
 *
 * Sizes are fixed rather than parameterised. A `size` prop on every
 * component is how the last system drifted — it offers the caller a way
 * to be slightly different, and callers always take it.
 */

/* --- Page shell ------------------------------------------------------ */

/** Big title, optional greeting above and sentence below. */
export function PageHeader({
  title, greeting, subtitle, action, className,
}: {
  title: string;
  greeting?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4 mb-4", className)}>
      <div className="min-w-0">
        {greeting && <p className="text-[17px] text-slate-500 leading-tight mb-0.5">{greeting}</p>}
        <h1 className="text-[32px] lg:text-[38px] leading-[1.08] font-extrabold tracking-[-0.02em] text-slate-900 text-balance">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-[17px] text-slate-500 leading-snug">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 pb-1">{action}</div>}
    </div>
  );
}

/** The quiet uppercase rule above a group. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("px-1 mb-2 text-[12px] font-extrabold uppercase tracking-[0.09em] text-slate-400", className)}>
      {children}
    </h2>
  );
}

/** The white surface everything sits on. */
export function Card({ children, className, as: As = "div" }: {
  children: React.ReactNode; className?: string; as?: "div" | "section" | "li";
}) {
  return <As className={cn("bg-white rounded-card border border-slate-100 shadow-soft", className)}>{children}</As>;
}

/* --- Icons ----------------------------------------------------------- */

/** Rounded-square chip for list rows. */
export function IconChip({ icon: Icon, tone = "brand", className }: {
  icon: LucideIcon; tone?: "brand" | "emerald" | "amber" | "rose" | "slate"; className?: string;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-500",
    slate: "bg-slate-100 text-slate-500",
  } as const;
  return (
    <span className={cn("w-11 h-11 rounded-field flex items-center justify-center shrink-0", tones[tone], className)}>
      <Icon className="w-[21px] h-[21px]" aria-hidden="true" />
    </span>
  );
}

/** Larger circular chip for the three-up tile row. */
export function CircleChip({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center", className)}>
      <Icon className="w-6 h-6" aria-hidden="true" />
    </span>
  );
}

/* --- Rows ------------------------------------------------------------ */

/* One card, hairline dividers, rounded ends.
 *
 * Grouping matters beyond looks: a stack of separate cards reads as
 * unrelated choices, while one divided card reads as a set — which is
 * what a settings list is. */
export function RowGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ul className={cn(
      "bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden",
      "divide-y divide-slate-100",
      className,
    )}>
      {children}
    </ul>
  );
}

export function Row({
  icon, tone, title, sub, href, onClick, trailing, danger, className,
}: {
  icon?: LucideIcon;
  tone?: React.ComponentProps<typeof IconChip>["tone"];
  title: string;
  sub?: string;
  href?: string;
  onClick?: () => void;
  /** Replaces the chevron — a toggle, a value, a badge. */
  trailing?: React.ReactNode;
  danger?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {icon && <IconChip icon={icon} tone={danger ? "slate" : tone} />}
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block text-[16px] font-bold leading-tight", danger ? "text-slate-500" : "text-slate-900")}>
          {title}
        </span>
        {sub && <span className="block text-[14px] text-slate-500 leading-snug mt-0.5">{sub}</span>}
      </span>
      {trailing ?? <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" aria-hidden="true" />}
    </>
  );
  const cls = cn("w-full flex items-center gap-3.5 p-4 min-h-[68px]", className);

  if (href) return <li><Link href={href} className={cls}>{body}</Link></li>;
  if (onClick) return <li><button type="button" onClick={onClick} className={cls}>{body}</button></li>;
  return <li className={cls}>{body}</li>;
}

/* --- Actions --------------------------------------------------------- */

const ACTION_BASE =
  "w-full inline-flex items-center justify-center gap-2.5 rounded-btn text-[17px] font-bold " +
  "min-h-[56px] px-5 disabled:opacity-50 transition-colors";

export const actionClass = {
  primary: cn(ACTION_BASE, "bg-brand-600 text-white"),
  outline: cn(ACTION_BASE, "border-2 border-brand-600 text-brand-700 bg-white"),
  quiet: cn(ACTION_BASE, "bg-slate-100 text-slate-700"),
} as const;

export function Action({
  href, children, variant = "primary", icon: Icon, trailingChevron, className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof actionClass;
  icon?: LucideIcon;
  trailingChevron?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(actionClass[variant], trailingChevron && "justify-between", className)}>
      <span className="inline-flex items-center gap-2.5">
        {Icon && <Icon className="w-5 h-5" aria-hidden="true" />}
        {children}
      </span>
      {trailingChevron && <ChevronRight className="w-5 h-5 shrink-0" aria-hidden="true" />}
    </Link>
  );
}

/** A purple text link with a chevron, for "View earnings ›". */
export function TextAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[15px] font-bold text-brand-700">
      {children}
      <ChevronRight className="w-4 h-4" aria-hidden="true" />
    </Link>
  );
}

/* --- Data ------------------------------------------------------------ */

/** Two-up metric tile: chip, label, then the number that matters. */
export function StatCard({ icon, label, value, note, tone = "brand" }: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
  tone?: React.ComponentProps<typeof IconChip>["tone"];
}) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <IconChip icon={icon} tone={tone} />
      <div className="min-w-0">
        <div className="text-[14px] text-slate-500 leading-tight">{label}</div>
        <div className="text-[21px] font-extrabold text-slate-900 leading-tight mt-0.5 tabular-nums">{value}</div>
        {note && <div className="text-[13px] text-slate-400 leading-tight mt-0.5">{note}</div>}
      </div>
    </Card>
  );
}

/** Green/amber/grey status chip, as used beside Payouts and the profile. */
export function StatusPill({ tone, children }: {
  tone: "good" | "warn" | "idle"; children: React.ReactNode;
}) {
  const tones = {
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-800",
    idle: "bg-slate-100 text-slate-600",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-bold", tones[tone])}>
      {children}
    </span>
  );
}

/** Nothing here yet — and what to do about it. */
export function EmptyState({ icon: Icon, title, body, children }: {
  icon: LucideIcon; title: string; body: string; children?: React.ReactNode;
}) {
  return (
    <Card className="p-7 sm:p-9 text-center">
      <span className="inline-flex w-16 h-16 rounded-full bg-brand-50 items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-brand-600" aria-hidden="true" />
      </span>
      <h3 className="text-[20px] font-extrabold text-slate-900 leading-snug text-balance">{title}</h3>
      <p className="mt-1.5 text-[15px] text-slate-500 leading-relaxed max-w-sm mx-auto">{body}</p>
      {children && <div className="mt-5 space-y-2.5">{children}</div>}
    </Card>
  );
}

/** The soft lavender note at the foot of a screen. */
export function Hint({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-card bg-brand-50/70 px-4 py-3.5 text-[14px] text-slate-600 leading-snug">
      <Icon className="w-[18px] h-[18px] text-brand-600 mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
