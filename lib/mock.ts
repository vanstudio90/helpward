/* Mock data shared across the app — first-pass UX prototype */

export type Service = {
  slug: string;
  title: string;
  blurb: string;
  fromPrice: number;
  eta: string;
  category: ServiceCategory;
  popular?: boolean;
  image: string;
};

export type ServiceCategory =
  | "Transportation"
  | "Home Help"
  | "Errands"
  | "Presence"
  | "Lifestyle"
  | "Business";

export const categories: { label: ServiceCategory; icon: string }[] = [
  { label: "Transportation", icon: "car" },
  { label: "Home Help", icon: "home" },
  { label: "Errands", icon: "bag" },
  { label: "Presence", icon: "user" },
  { label: "Lifestyle", icon: "heart" },
  { label: "Business", icon: "briefcase" },
];

const u = (id: number, w = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

export const services: Service[] = [
  { slug: "designated-driver", title: "Designated Driver", blurb: "A verified driver drives you & your car home safely.", fromPrice: 29, eta: "20 min", category: "Transportation", popular: true,
    image: "1502877338535-766e1452684a" },
  { slug: "furniture-assembly", title: "Furniture Assembly", blurb: "Experts assemble your furniture quickly. IKEA, couches, beds & more.", fromPrice: 50, eta: "30 min", category: "Home Help",
    image: "1581578731548-c64695cc6952" },
  { slug: "grocery-pickup", title: "Grocery Pickup", blurb: "We shop and deliver groceries to your door.", fromPrice: 15, eta: "30-60 min", category: "Errands", popular: true,
    image: "1542838132-92c53300491e" },
  { slug: "house-check-in", title: "House Check-In", blurb: "We check your home and send updates.", fromPrice: 20, eta: "30 min", category: "Home Help",
    image: "1568605114967-8130f3a36994" },
  { slug: "package-return", title: "Package Return", blurb: "Return to any store/courier.", fromPrice: 20, eta: "20-40 min", category: "Errands",
    image: "1607082348824-0a96f2a4b9da" },
  { slug: "moving-help", title: "Moving Help", blurb: "Get help loading, unloading or moving.", fromPrice: 40, eta: "Arrives in 30 min", category: "Home Help",
    image: "1600585154340-be6161a56a0c" },
  { slug: "package-delivery", title: "Package Delivery", blurb: "Pick up and deliver any item quickly.", fromPrice: 12, eta: "30 min", category: "Errands",
    image: "1586528116311-ad8dd3c8310d" },
  { slug: "wait-in-line", title: "Wait in Line", blurb: "We wait in line so you don't have to.", fromPrice: 15, eta: "Starts in 15 min", category: "Presence",
    image: "1521791136064-7986c2920216" },
  { slug: "tv-mounting", title: "TV Mounting", blurb: "Securely mount any TV.", fromPrice: 60, eta: "30-45 min", category: "Home Help",
    image: "1593359677879-a4bb92f829d1" },
  { slug: "dog-walking", title: "Dog Walking", blurb: "Walk & care for your dog.", fromPrice: 20, eta: "Starts in 15 min", category: "Lifestyle",
    image: "1587300003388-59208cc962cb" },
  { slug: "errand-runner", title: "Errand Runner", blurb: "Any errand, any store.", fromPrice: 20, eta: "20-40 min", category: "Errands",
    image: "1556909114-f6e7ad7d3136" },
  { slug: "elder-assistance", title: "Elder Assistance", blurb: "Companion & errands for seniors.", fromPrice: 25, eta: "45 min", category: "Lifestyle",
    image: "1559839734-2b71ea197ec2" },
  { slug: "car-battery-jump", title: "Car Battery Jump", blurb: "We jump-start your car.", fromPrice: 35, eta: "25 min", category: "Transportation",
    image: "1485827404703-89b55fcc595e" },
  { slug: "tech-setup", title: "Tech Setup", blurb: "Set up devices, Wi-Fi, smart home.", fromPrice: 45, eta: "45 min", category: "Home Help",
    image: "1517048676732-d65bc937f952" },
  { slug: "event-companion", title: "Event Companion", blurb: "A plus-one for any event.", fromPrice: 50, eta: "On schedule", category: "Lifestyle",
    image: "1511795409834-ef04bbd61622" },
  { slug: "property-inspection", title: "Property Inspection", blurb: "A verified human inspects & reports.", fromPrice: 60, eta: "60 min", category: "Business",
    image: "1568605114967-8130f3a36994" },
].map((s) => ({ ...s, image: u(Number(s.image.replace(/[^0-9]/g, ""))) }));

export type Provider = {
  id: string;
  name: string;
  role: string;
  rating: number;
  reviews: number;
  avatar: string;
  tag?: string;
  verified?: boolean;
  services?: string[];
  badges?: string[];
  about?: string;
  member?: string;
  completed?: number;
  response?: string;
  languages?: string;
  serviceIcon?: string;
};

const av = (n: number) => `https://i.pravatar.cc/160?img=${n}`;

export const providers: Provider[] = [
  { id: "james-carter", name: "James Carter", role: "Designated Driver", rating: 4.9, reviews: 1248, avatar: av(12), tag: "Top Rated", verified: true,
    services: ["Designated Driver", "Airport Transfer", "Ride to Event"], badges: ["ID Verified", "Background Checked", "Insured"],
    about: "Professional and reliable driver with 8+ years of experience. Specializes in safe and comfortable rides.",
    member: "Jan 2023", completed: 1248, response: "Usually within 5 min", languages: "English, Spanish", serviceIcon: "car" },
  { id: "sarah-thompson", name: "Sarah Thompson", role: "Grocery Pickup", rating: 4.8, reviews: 842, avatar: av(47), tag: "Fast & Reliable", verified: true,
    services: ["Grocery Pickup", "Errand Runner"], badges: ["ID Verified", "Background Checked"], member: "Mar 2023", completed: 842, response: "Usually within 7 min", languages: "English", serviceIcon: "bag" },
  { id: "michael-roberts", name: "Michael Roberts", role: "Furniture Assembly", rating: 4.9, reviews: 632, avatar: av(33), tag: "Highly Skilled", verified: true,
    services: ["Furniture Assembly", "TV Mounting"], badges: ["ID Verified", "Insured"], member: "Feb 2023", completed: 632, response: "Within 15 min", languages: "English", serviceIcon: "box" },
  { id: "emma-wilson", name: "Emma Wilson", role: "House Cleaning", rating: 4.8, reviews: 1103, avatar: av(45), tag: "Excellent", verified: true,
    services: ["House Cleaning", "House Check-In", "Dog Walking", "Plant Care", "Elder Assist"], badges: ["ID Verified", "Background Checked"], member: "Feb 2023", completed: 1103, response: "Within 10 min", languages: "English", serviceIcon: "home" },
  { id: "david-lee", name: "David Lee", role: "Moving Help", rating: 4.7, reviews: 521, avatar: av(15), verified: true, services: ["Moving Help"], serviceIcon: "truck" },
  { id: "ryan-patel", name: "Ryan Patel", role: "Package Delivery", rating: 4.9, reviews: 917, avatar: av(58), verified: true, services: ["Package Delivery"], serviceIcon: "box" },
  { id: "olivia-brown", name: "Olivia Brown", role: "Dog Walking", rating: 4.8, reviews: 732, avatar: av(48), verified: true, services: ["Dog Walking"], serviceIcon: "paw" },
  { id: "daniel-martinez", name: "Daniel Martinez", role: "Home Repair", rating: 4.7, reviews: 423, avatar: av(60), verified: true, services: ["Home Repair", "TV Mounting"], serviceIcon: "wrench" },
];

export type Booking = {
  id: string;
  service: string;
  providerId: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  when: string;
  whenLabel: string;
  address: string;
  price: number;
  icon: string;
};

export const bookings: Booking[] = [
  { id: "BKG-7821-AC3", service: "Designated Driver", providerId: "james-carter", status: "scheduled",
    when: "today-10pm", whenLabel: "Today, May 17 · 10:00 PM",
    address: "123 Main St, Vancouver, BC → Home", price: 48.5, icon: "car" },
  { id: "BKG-7812-FD9", service: "Grocery Pickup", providerId: "sarah-thompson", status: "scheduled",
    when: "tmrw-6pm", whenLabel: "Tomorrow, May 18 · 6:00 PM",
    address: "Safeway, 1234 W Broadway, Vancouver", price: 32.2, icon: "bag" },
  { id: "BKG-7799-KL2", service: "Furniture Assembly", providerId: "michael-roberts", status: "scheduled",
    when: "mon-11am", whenLabel: "Mon, May 20 · 11:00 AM",
    address: "123 Main St, Vancouver, BC", price: 75, icon: "box" },
  { id: "BKG-7788-HJ1", service: "House Check-In", providerId: "emma-wilson", status: "scheduled",
    when: "tue-2pm", whenLabel: "Tue, May 21 · 2:00 PM",
    address: "456 Oak St, Vancouver, BC", price: 25, icon: "pin" },
  { id: "BKG-7766-MV3", service: "Moving Help", providerId: "david-lee", status: "in_progress",
    when: "9:15am", whenLabel: "Started at 9:15 AM · Est. 11:00 AM",
    address: "123 Main St, Vancouver, BC", price: 120, icon: "truck" },
  { id: "BKG-7744-PQ8", service: "Package Delivery", providerId: "ryan-patel", status: "in_progress",
    when: "10:30am", whenLabel: "Started at 10:30 AM · Est. 11:30 AM",
    address: "Staples, 789 Granville St, Vancouver", price: 18.75, icon: "box" },
  { id: "BKG-7722-DG7", service: "Dog Walking", providerId: "olivia-brown", status: "completed",
    when: "may-16", whenLabel: "May 16, 6:00 PM",
    address: "123 Main St, Vancouver, BC", price: 20, icon: "paw" },
  { id: "BKG-7701-KP5", service: "Key Pickup/Drop", providerId: "james-carter", status: "completed",
    when: "may-15", whenLabel: "May 15, 3:30 PM",
    address: "321 Pine St, Vancouver, BC", price: 15, icon: "key" },
];

export type Transaction = {
  id: string;
  service: string;
  providerId: string;
  date: string;
  amount: number;
  status: "completed" | "pending" | "refunded";
  bookingId: string;
  icon: string;
};

export const transactions: Transaction[] = [
  { id: "TX-1", service: "Designated Driver", providerId: "james-carter", date: "May 17, 2024 · 10:00 PM", amount: 48.5, status: "completed", bookingId: "BKG-7821-AC3", icon: "car" },
  { id: "TX-2", service: "Grocery Pickup", providerId: "sarah-thompson", date: "May 18, 2024 · 6:00 PM", amount: 32.2, status: "completed", bookingId: "BKG-7812-FD9", icon: "bag" },
  { id: "TX-3", service: "Furniture Assembly", providerId: "michael-roberts", date: "May 20, 2024 · 11:00 AM", amount: 75, status: "pending", bookingId: "BKG-7799-KL2", icon: "box" },
  { id: "TX-4", service: "House Check-In", providerId: "emma-wilson", date: "May 21, 2024 · 2:00 PM", amount: 25, status: "completed", bookingId: "BKG-7788-HJ1", icon: "pin" },
  { id: "TX-5", service: "Moving Help", providerId: "david-lee", date: "May 15, 2024 · 9:15 AM", amount: 120, status: "completed", bookingId: "BKG-7766-MV3", icon: "truck" },
  { id: "TX-6", service: "Package Delivery", providerId: "ryan-patel", date: "May 15, 2024 · 10:30 AM", amount: 18.75, status: "completed", bookingId: "BKG-7744-PQ8", icon: "box" },
  { id: "TX-7", service: "Dog Walking", providerId: "olivia-brown", date: "May 16, 2024 · 6:00 PM", amount: 20, status: "refunded", bookingId: "BKG-7722-DG7", icon: "paw" },
  { id: "TX-8", service: "Key Pickup/Drop", providerId: "james-carter", date: "May 15, 2024 · 3:30 PM", amount: 15, status: "completed", bookingId: "BKG-7701-KP5", icon: "key" },
];

export type Conversation = {
  id: string;
  providerId: string;
  taskId: string;
  service: string;
  preview: string;
  time: string;
  unread?: number;
  messages: { from: "me" | "them"; text: string; time: string }[];
};

export const conversations: Conversation[] = [
  {
    id: "c1", providerId: "james-carter", taskId: "TASK-7821", service: "Furniture assembly",
    preview: "On my way! I'll be there in about 12 min.", time: "10:24 AM", unread: 2,
    messages: [
      { from: "them", text: "Hi Alex! This is James.", time: "10:12 AM" },
      { from: "them", text: "I'm on my way to your place and should arrive in about 12 minutes.", time: "10:13 AM" },
      { from: "me", text: "Great, thank you! See you soon.", time: "10:13 AM" },
      { from: "them", text: "I'll call you once I'm at the door.", time: "10:14 AM" },
    ],
  },
  {
    id: "c2", providerId: "sarah-thompson", taskId: "TASK-7812", service: "Grocery pickup",
    preview: "Do you have any preference for the brand?", time: "9:15 AM",
    messages: [{ from: "them", text: "Do you have any preference for the brand?", time: "9:15 AM" }],
  },
  {
    id: "c3", providerId: "michael-roberts", taskId: "TASK-7799", service: "House check-in",
    preview: "Check-in completed. Everything looks good!", time: "Yesterday",
    messages: [{ from: "them", text: "Check-in completed. Everything looks good!", time: "Yesterday" }],
  },
  {
    id: "c4", providerId: "david-lee", taskId: "TASK-7766", service: "Package return",
    preview: "Package has been dropped off ✅", time: "Yesterday", unread: 1,
    messages: [{ from: "them", text: "Package has been dropped off ✅", time: "Yesterday" }],
  },
  {
    id: "c5", providerId: "emma-wilson", taskId: "TASK-7722", service: "Dog walking",
    preview: "Thanks! Charlie had a great walk 🐶", time: "2 days ago",
    messages: [{ from: "them", text: "Thanks! Charlie had a great walk 🐶", time: "2 days ago" }],
  },
];

export function providerById(id: string) {
  return providers.find((p) => p.id === id);
}

export const stats = {
  upcoming: 2,
  inProgress: 1,
  completedMonth: 28,
  totalSpentMonth: 1246,
  walletBalance: 124.5,
  totalSpentAll: 2486.75,
  totalBookings: 128,
};

export const liveActivity = [
  { who: "Sophie", verb: "completed a grocery pickup", where: "Downtown, Vancouver", ago: "2 min ago" },
  { who: "Michael", verb: "is on the way to a task", where: "Yaletown, Vancouver", ago: "3 min ago" },
  { who: "Package", verb: "delivered", where: "Kitsilano, Vancouver", ago: "5 min ago" },
  { who: "Emily", verb: "completed a furniture assembly", where: "Mount Pleasant, Vancouver", ago: "7 min ago" },
];
