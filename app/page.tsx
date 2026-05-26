import Link from "next/link";
import {
  Sparkles, Shield, MapPin, Lock, ArrowRight, Play, Car, Home, ShoppingBag,
  User, Heart, Briefcase, Star, CheckCircle2,
} from "lucide-react";

const popular = [
  { icon: Car, tone: "bg-brand-50 text-brand-600", title: "Transportation",
    items: ["Designated driver", "Ride assistance", "Vehicle delivery"] },
  { icon: Home, tone: "bg-emerald-50 text-emerald-600", title: "Home Help",
    items: ["Furniture assembly", "TV mounting", "Moving help"] },
  { icon: ShoppingBag, tone: "bg-amber-50 text-amber-600", title: "Errands",
    items: ["Grocery pickup", "Package returns", "Line waiting"] },
  { icon: User, tone: "bg-brand-50 text-brand-600", title: "Presence",
    items: ["House check-ins", "Elder visits", "Property inspections"] },
  { icon: Heart, tone: "bg-rose-50 text-rose-600", title: "Lifestyle",
    items: ["Event companion", "Dog walking", "Shopping assistant"] },
  { icon: Briefcase, tone: "bg-violet-50 text-violet-600", title: "Business",
    items: ["Inventory checks", "Local inspections", "Temporary labor"] },
];

const live = [
  { who: "Sophie", verb: "completed a grocery pickup", where: "Downtown, Vancouver", ago: "2 min ago", img: 47 },
  { who: "Michael", verb: "is on the way to a task", where: "Yaletown, Vancouver", ago: "3 min ago", img: 33 },
  { who: "Package", verb: "delivered", where: "Kitsilano, Vancouver", ago: "5 min ago", img: 58 },
  { who: "Emily", verb: "completed a furniture assembly", where: "Mount Pleasant, Vancouver", ago: "7 min ago", img: 45 },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
            <span className="text-lg font-bold tracking-tight">Helpward</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-700">
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#services" className="hover:text-slate-900">Services</a>
            <a href="#business" className="hover:text-slate-900">For Business</a>
            <a href="#safety" className="hover:text-slate-900">Safety</a>
            <a href="#providers" className="hover:text-slate-900">Become a Provider</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="hidden sm:inline-flex text-sm font-medium px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100">
              Log in
            </Link>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-sky-50 -z-10" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
              Real humans.<br />
              Real help. <span className="text-brand-600">Right now.</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600 max-w-xl">
              The Human Infrastructure Network. Anything you need in the real world, on demand.
            </p>

            <div className="mt-8 bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-4 sm:p-5 max-w-2xl">
              <label className="text-xs font-semibold text-slate-600">What do you need help with?</label>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Examples: Drive me home, Wait for a package, Help move furniture..."
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
                />
                <Link
                  href="/new-request"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
                >
                  Get help now <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Feature icon={<Sparkles className="w-4 h-4 text-brand-600" />} title="AI Matched" sub="Best match in seconds" />
                <Feature icon={<Shield className="w-4 h-4 text-emerald-600" />} title="Verified Humans" sub="ID, background & reviews" />
                <Feature icon={<MapPin className="w-4 h-4 text-brand-600" />} title="Live Tracking" sub="Track your task in real time" />
                <Feature icon={<Lock className="w-4 h-4 text-slate-700" />} title="Safe & Insured" sub="You're always protected" />
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[5/4] rounded-3xl overflow-hidden shadow-2xl shadow-brand-900/10 bg-gradient-to-br from-brand-100 to-sky-100">
              <img
                src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1400&q=70"
                alt="Live tracking on map"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            <FloatingCard className="top-4 right-4" tone="white">
              <img src="https://i.pravatar.cc/40?img=12" className="w-9 h-9 rounded-full" alt="" />
              <div>
                <div className="text-xs text-slate-500">Driver on the way</div>
                <div className="text-sm font-semibold">2 min away</div>
              </div>
            </FloatingCard>
            <FloatingCard className="top-1/3 -right-4 lg:right-2" tone="white">
              <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500">Task in progress</div>
                <div className="text-sm font-semibold">Furniture assembly</div>
              </div>
            </FloatingCard>
            <FloatingCard className="bottom-6 left-6" tone="white">
              <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500">Task completed</div>
                <div className="flex items-center gap-1 text-amber-500 text-xs">★★★★★ <span className="text-slate-500">Package delivered</span></div>
              </div>
            </FloatingCard>
          </div>
        </div>
      </section>

      {/* Popular services */}
      <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Popular services</h2>
          <Link href="/services" className="text-sm font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
            View all services <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {popular.map((cat) => (
            <div key={cat.title} className="rounded-2xl border border-slate-100 bg-white p-5 hover:shadow-lg hover:-translate-y-0.5 transition">
              <span className={`inline-flex w-11 h-11 rounded-xl ${cat.tone} items-center justify-center mb-4`}>
                <cat.icon className="w-5 h-5" />
              </span>
              <div className="text-sm font-bold text-slate-900 mb-2">{cat.title}</div>
              <ul className="space-y-1 text-xs text-slate-600">
                {cat.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-slate-50 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How it works</h2>
            <p className="mt-2 text-slate-600">Three simple steps to get anything done.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            <Step n={1} title="Request help" sub="Tell us what you need">
              <div className="bg-slate-100 rounded-xl p-4">
                <div className="bg-white rounded-lg p-3 text-sm text-slate-700">
                  I need someone to wait for my package
                </div>
                <div className="grid grid-cols-10 gap-1 mt-3 text-[10px] text-slate-500 font-mono">
                  {"QWERTYUIOPASDFGHJKL".split("").map((k, i) => (
                    <div key={i} className="bg-white rounded text-center py-1">{k}</div>
                  ))}
                </div>
              </div>
            </Step>
            <div className="hidden md:flex items-center justify-center -mx-3">
              <ArrowRight className="w-6 h-6 text-slate-300" />
            </div>
            <Step n={2} title="AI matches instantly" sub="We find the best human for the job">
              <div className="bg-gradient-to-br from-brand-50 to-sky-50 rounded-xl aspect-video flex items-end p-3">
                <div className="bg-white rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm">
                  <img src="https://i.pravatar.cc/30?img=12" className="w-7 h-7 rounded-full" alt="" />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900">Best match</div>
                    <div className="text-slate-500">2 min away</div>
                  </div>
                </div>
              </div>
            </Step>
            <div className="hidden md:hidden" />
            <Step n={3} title="Task completed" sub="Track in real time, pay securely">
              <div className="bg-emerald-50 rounded-xl p-4 flex items-center gap-3">
                <img src="https://i.pravatar.cc/40?img=47" className="w-10 h-10 rounded-full" alt="" />
                <div>
                  <div className="text-sm font-semibold">Task completed!</div>
                  <div className="text-xs text-slate-500">Thank you!</div>
                  <div className="text-amber-500 text-xs">★★★★★</div>
                </div>
              </div>
            </Step>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section id="safety" className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-xl font-bold">Trusted by thousands</h3>
            <p className="text-sm text-slate-300 mt-1">Safety and trust are at the core of everything we do.</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 text-xs">
              <Pill icon="🛡" label="Government ID Verification" />
              <Pill icon="🔍" label="Background Checks" />
              <Pill icon="🛡" label="Insurance Protection" />
              <Pill icon="📍" label="Live GPS Tracking" />
              <Pill icon="🎧" label="24/7 Support" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-4xl font-bold">98.7%</div>
              <div className="text-sm text-slate-300">Task completion rate</div>
            </div>
            <div>
              <div className="text-4xl font-bold">4.9/5</div>
              <div className="text-sm text-slate-300">Average rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* Live activity + CTAs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20 grid lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Live activity in your city</h3>
            <Link href="/dashboard" className="text-xs font-semibold text-brand-700">View live map →</Link>
          </div>
          <ul className="space-y-4">
            {live.map((a, i) => (
              <li key={i} className="flex items-center gap-3">
                <img src={`https://i.pravatar.cc/40?img=${a.img}`} className="w-9 h-9 rounded-full" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-900">{a.who}</span>{" "}
                    <span className="text-slate-600">{a.verb}</span>
                  </div>
                  <div className="text-xs text-slate-500">{a.where}</div>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{a.ago}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-slate-100 min-h-[280px]">
          <img src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=1000&q=70" alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <h3 className="text-xl font-bold leading-tight">Too much to do?<br />We've got you.</h3>
            <p className="text-sm text-white/85 mt-1">From small errands to big tasks, our network of verified humans is ready to help.</p>
            <Link href="/new-request" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold">
              Get help now <Play className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-brand-50 min-h-[280px]">
          <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=70" alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-900/70 via-brand-900/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <h3 className="text-xl font-bold leading-tight">Work with us</h3>
            <p className="text-sm text-white/90 mt-1">Earn on your terms. Be your own boss and help your community.</p>
            <Link href="#providers" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold">
              Become a provider <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="border-t border-slate-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-xs font-semibold tracking-widest text-slate-400 mb-4">
            TRUSTED BY BUSINESSES AND INDIVIDUALS
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 opacity-70">
            {["amazon", "shopify", "ups", "costco", "instacart", "airbnb"].map((b) => (
              <span key={b} className="text-slate-400 text-sm font-bold uppercase tracking-wide">{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 border-t border-slate-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-600 text-white flex items-center justify-center text-xs font-bold">H</div>
            <span>© {new Date().getFullYear()} Helpward — Real humans, real help.</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-slate-900">Terms</a>
            <a href="#" className="hover:text-slate-900">Privacy</a>
            <a href="#" className="hover:text-slate-900">Help Center</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-[11px] font-semibold text-slate-900">{title}</div>
        <div className="text-[10px] text-slate-500 leading-tight">{sub}</div>
      </div>
    </div>
  );
}

function FloatingCard({
  children, className = "", tone = "white",
}: { children: React.ReactNode; className?: string; tone?: "white" }) {
  return (
    <div
      className={`absolute ${className} flex items-center gap-3 ${tone === "white" ? "bg-white" : ""} rounded-2xl shadow-xl shadow-slate-900/10 px-3 py-2.5 border border-slate-100`}
    >
      {children}
    </div>
  );
}

function Step({
  n, title, sub, children,
}: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">{n}</span>
        <span className="text-sm font-bold text-slate-900">{title}</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">{sub}</p>
      {children}
    </div>
  );
}

function Pill({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-200">
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}
