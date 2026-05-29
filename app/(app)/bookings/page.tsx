import { listMyBookings } from "@/lib/data/customer";
import { listMyRequests } from "@/lib/data/requests";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BookingsView } from "./view";

export type SeriesRow = {
  id: string;
  cadence: "weekly" | "biweekly" | "monthly";
  weekday: number | null;
  day_of_month: number | null;
  time_of_day: string;
  status: "active" | "paused" | "cancelled" | "completed";
  occurrences_created: number;
  max_occurrences: number | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  service: { id: string; title: string; image_url: string | null } | null;
};

export default async function BookingsPage() {
  const supabase = await createSupabaseServerClient();
  const seriesPromise = supabase
    .from("booking_series")
    .select(`
      id, cadence, weekday, day_of_month, time_of_day,
      status, occurrences_created, max_occurrences,
      start_date, end_date, notes,
      service:services(id, title, image_url)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  const [bookings, requests, { data: series }] = await Promise.all([
    listMyBookings(),
    listMyRequests(),
    seriesPromise,
  ]);
  return (
    <BookingsView
      bookings={bookings}
      requests={requests}
      series={(series ?? []) as unknown as SeriesRow[]}
    />
  );
}
