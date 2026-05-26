import {
  Car, Home, ShoppingBag, User, Heart, Briefcase, Box, Truck, MapPin,
  Key, PawPrint, Wrench, Plane, Calendar, Sparkles, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  car: Car, home: Home, bag: ShoppingBag, user: User, heart: Heart,
  briefcase: Briefcase, box: Box, truck: Truck, pin: MapPin, key: Key,
  paw: PawPrint, wrench: Wrench, plane: Plane, calendar: Calendar,
  spark: Sparkles, more: MoreHorizontal,
};

const TONES: Record<string, string> = {
  car: "bg-brand-50 text-brand-600",
  home: "bg-emerald-50 text-emerald-600",
  bag: "bg-emerald-50 text-emerald-600",
  user: "bg-brand-50 text-brand-600",
  heart: "bg-rose-50 text-rose-600",
  briefcase: "bg-violet-50 text-violet-600",
  box: "bg-amber-50 text-amber-600",
  truck: "bg-orange-50 text-orange-600",
  pin: "bg-brand-50 text-brand-600",
  key: "bg-emerald-50 text-emerald-600",
  paw: "bg-rose-50 text-rose-600",
  wrench: "bg-slate-100 text-slate-700",
  plane: "bg-sky-50 text-sky-600",
  calendar: "bg-brand-50 text-brand-600",
  spark: "bg-brand-50 text-brand-600",
};

export function ServiceIcon({
  name, size = "md", className = "",
}: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = MAP[name] ?? Sparkles;
  const tone = TONES[name] ?? "bg-slate-100 text-slate-700";
  const dims =
    size === "sm" ? "w-9 h-9 rounded-lg" :
    size === "lg" ? "w-14 h-14 rounded-2xl" :
    "w-11 h-11 rounded-xl";
  const ic = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-7 h-7" : "w-5 h-5";
  return (
    <span className={`inline-flex items-center justify-center ${dims} ${tone} ${className}`}>
      <Icon className={ic} />
    </span>
  );
}
