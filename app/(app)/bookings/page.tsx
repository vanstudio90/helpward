import { listMyBookings } from "@/lib/data/customer";
import { listMyRequests } from "@/lib/data/requests";
import { BookingsView } from "./view";

export default async function BookingsPage() {
  const [bookings, requests] = await Promise.all([listMyBookings(), listMyRequests()]);
  return <BookingsView bookings={bookings} requests={requests} />;
}
