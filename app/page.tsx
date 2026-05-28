import Link from "next/link";
import {
  Sparkles, Shield, MapPin, Lock, ArrowRight, Play, Star,
} from "lucide-react";
import { MapBackdrop } from "@/components/MapBackdrop";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "./_landing-header";
import { listServices, listCategories } from "@/lib/data/services";

const live = [
  { who: "Sophie", verb: "completed a grocery pickup", where: "Downtown, Vancouver", ago: "2 min ago", img: 47 },
  { who: "Michael", verb: "is on the way to a task", where: "Yaletown, Vancouver", ago: "3 min ago", img: 33 },
  { who: "Package", verb: "delivered", where: "Kitsilano, Vancouver", ago: "5 min ago", img: 58 },
  { who: "Emily", verb: "completed a furniture assembly", where: "Mount Pleasant, Vancouver", ago: "7 min ago", img: 45 },
];

export default async function LandingPage() {
  const [services, categories] = await Promise.all([listServices(), listCategories()]);

  // Group services under their category, in category sort_order. Empty
  // categories drop out so we never show a header with no children.
  const grouped = categories
    .map((c) => ({ category: c, items: services.filter((s) => s.category?.id === c.id) }))
    .filter((g) => g.items.length > 0);
  const totalServices = services.length;

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-sky-50 -z-10" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 lg:pt-20 lg:pb-24">
          <div className="grid gap-6 lg:gap-12 lg:grid-cols-2 lg:items-start">
            <div className="lg:row-start-1 lg:col-start-1">
              <h1 className="text-[42px] sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
                Real humans.<br />
                Real help. <span className="text-brand-600">Right now.</span>
              </h1>
              <p className="mt-4 lg:mt-5 text-base lg:text-lg text-slate-600 max-w-xl">
                The Human Infrastructure Network.<br className="hidden sm:block" />
                Anything you need in the real world, on demand.
              </p>
            </div>

            <div className="relative lg:row-start-1 lg:row-span-2 lg:col-start-2">
              <div className="relative aspect-[4/3] sm:aspect-[5/4] rounded-3xl overflow-hidden shadow-xl shadow-brand-900/10">
                <MapBackdrop />
                <div className="absolute inset-0 pointer-events-none">
                  <img src="https://i.pravatar.cc/60?img=12" className="absolute top-[20%] left-[44%] w-8 h-8 sm:w-9 sm:h-9 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                  <img src="https://i.pravatar.cc/60?img=45" className="absolute top-[16%] right-[10%] w-9 h-9 sm:w-10 sm:h-10 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                  <img src="https://i.pravatar.cc/60?img=33" className="absolute top-[36%] left-[24%] w-8 h-8 sm:w-9 sm:h-9 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                  <img src="https://i.pravatar.cc/60?img=58" className="absolute top-[58%] left-[48%] w-8 h-8 sm:w-9 sm:h-9 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                </div>
              </div>

              <FloatingCard className="top-3 left-3">
                <img src="https://i.pravatar.cc/40?img=12" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full" alt="" loading="lazy" />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500">Driver on the way</div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 whitespace-nowrap">2 min away</div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 ml-1" />
              </FloatingCard>

              <FloatingCard className="top-[42%] right-2 sm:right-4">
                <img src="https://i.pravatar.cc/40?img=33" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full" alt="" loading="lazy" />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500">Task in progress</div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 whitespace-nowrap">Furniture assembly</div>
                </div>
              </FloatingCard>

              <FloatingCard className="bottom-3 right-3">
                <img src="https://i.pravatar.cc/40?img=58" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full" alt="" loading="lazy" />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500">Task completed</div>
                  <div className="flex items-center gap-1 text-amber-500 text-[11px]">
                    <Star className="w-3 h-3 fill-current" />
                    <Star className="w-3 h-3 fill-current" />
                    <Star className="w-3 h-3 fill-current" />
                    <Star className="w-3 h-3 fill-current" />
                    <Star className="w-3 h-3 fill-current" />
                    <span className="text-slate-500 ml-1">Receipt shared</span>
                  </div>
                </div>
              </FloatingCard>
            </div>

            <div className="space-y-3 lg:space-y-4 lg:row-start-2 lg:col-start-1">
              <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-4 sm:p-5">
                <label className="text-sm font-semibold text-slate-900">What do you need help with?</label>
                <input
                  type="text"
                  placeholder="Examples: Drive me home, Wait for a package, Help move furniture..."
                  className="mt-3 w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
                />
                <Link
                  href="/new-request"
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
                >
                  Get help now <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-4 sm:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <Feature icon={<Sparkles className="w-4 h-4 text-brand-600" />} title="AI Matched" sub="Best match in seconds" />
                  <Feature icon={<Shield className="w-4 h-4 text-emerald-600" />} title="Verified Humans" sub="ID, background & reviews" />
                  <Feature icon={<MapPin className="w-4 h-4 text-brand-600" />} title="Live Tracking" sub="Track your task in real time" />
                  <Feature icon={<Lock className="w-4 h-4 text-slate-700" />} title="Safe & Insured" sub="You're always protected" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Full services catalog — grouped by category, every active service shown */}
      <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 lg:mb-10">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-brand-700 mb-2">Everything we help with</div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900">
              {totalServices} services across {grouped.length} categories
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl">
              From rides home to TV mounting, errands to elder check-ins — request a verified human for almost anything in the real world. Pricing is upfront, payment lands after the task is done, and every helper is background-checked and insured.
            </p>
          </div>
          <Link href="/new-request" className="self-start sm:self-end shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition">
            Request something <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {grouped.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center text-sm text-slate-500">
            Catalog is loading. Check back in a moment.
          </div>
        ) : (
          <div className="space-y-8 lg:space-y-10">
            {grouped.map(({ category, items }) => (
              <div key={category.id}>
                <div className="flex items-center gap-3 mb-3 lg:mb-4">
                  <ServiceIcon name={category.icon ?? "spark"} size="md" />
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">{category.label}</h3>
                    <p className="text-xs sm:text-sm text-slate-500">{items.length} service{items.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                  {items.map((s) => (
                    <Link
                      key={s.id}
                      href={`/new-request?service=${s.id}`}
                      className="group flex flex-col rounded-2xl border border-slate-100 bg-white hover:border-brand-300 hover:shadow-lg hover:-translate-y-0.5 transition overflow-hidden"
                    >
                      {s.image_url && (
                        <div className="relative aspect-[5/3] bg-slate-100 overflow-hidden">
                          <img
                            src={s.image_url}
                            alt={s.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          {s.popular && (
                            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-1 rounded-md">
                              Popular
                            </span>
                          )}
                        </div>
                      )}
                      <div className="p-3 sm:p-4 flex-1 flex flex-col">
                        <div className="text-sm font-bold text-slate-900 truncate">{s.title}</div>
                        <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-2 flex-1">{s.blurb}</div>
                        <div className="mt-2 sm:mt-3 flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                          <span className="font-semibold text-slate-900 truncate">From ${(s.base_price_cents / 100).toFixed(0)}</span>
                          <span className="text-slate-500 whitespace-nowrap shrink-0">{s.eta_label}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 rounded-2xl bg-slate-50 border border-slate-100 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900">Need something not on this list?</div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Describe what you need — if it's legal, safe, and a human can do it, someone in the network can probably help.</p>
          </div>
          <Link href="/new-request" className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-100">
            Describe your task <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-slate-50 py-12 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 lg:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How it works</h2>
            <p className="mt-2 text-slate-600">Three simple steps to get anything done.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            <Step n={1} title="Request help" sub="Tell us what you need">
              <div className="bg-slate-100 rounded-xl p-4">
                <div className="bg-white rounded-lg p-3 text-sm text-slate-700">I need someone to wait for my package</div>
                <div className="grid grid-cols-10 gap-1 mt-3 text-[10px] text-slate-500 font-mono">
                  {"QWERTYUIOPASDFGHJKL".split("").map((k) => (
                    <div key={k} className="bg-white rounded text-center py-1">{k}</div>
                  ))}
                </div>
              </div>
            </Step>
            <div className="hidden md:flex items-center justify-center -mx-3"><ArrowRight className="w-6 h-6 text-slate-300" /></div>
            <Step n={2} title="AI matches instantly" sub="We find the best human for the job">
              <div className="bg-gradient-to-br from-brand-50 to-sky-50 rounded-xl aspect-video flex items-end p-3">
                <div className="bg-white rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm">
                  <img src="https://i.pravatar.cc/30?img=12" className="w-7 h-7 rounded-full" alt="" loading="lazy" />
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
                <img src="https://i.pravatar.cc/40?img=47" className="w-10 h-10 rounded-full" alt="" loading="lazy" />
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
            <div><div className="text-4xl font-bold">98.7%</div><div className="text-sm text-slate-300">Task completion rate</div></div>
            <div><div className="text-4xl font-bold">4.9/5</div><div className="text-sm text-slate-300">Average rating</div></div>
          </div>
        </div>
      </section>

      {/* Live activity + CTAs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 grid lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Live activity in your city</h3>
            <Link href="/dashboard" className="text-xs font-semibold text-brand-700">View live map →</Link>
          </div>
          <ul className="space-y-4">
            {live.map((a) => (
              <li key={`${a.who}-${a.ago}`} className="flex items-center gap-3">
                <img src={`https://i.pravatar.cc/40?img=${a.img}`} className="w-9 h-9 rounded-full" alt="" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-semibold text-slate-900">{a.who}</span> <span className="text-slate-600">{a.verb}</span></div>
                  <div className="text-xs text-slate-500">{a.where}</div>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{a.ago}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-slate-100 min-h-[260px] sm:min-h-[280px]">
          <img src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=1000&q=70" alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <h3 className="text-xl font-bold leading-tight">Too much to do?<br />We've got you.</h3>
            <p className="text-sm text-white/85 mt-1">From small errands to big tasks, our network of verified humans is ready to help.</p>
            <Link href="/new-request" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold">Get help now <Play className="w-3 h-3" /></Link>
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-brand-50 min-h-[260px] sm:min-h-[280px]">
          <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=70" alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-900/70 via-brand-900/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <h3 className="text-xl font-bold leading-tight">Work with us</h3>
            <p className="text-sm text-white/90 mt-1">Earn on your terms. Be your own boss and help your community.</p>
            <Link href="#providers" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold">Become a provider <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="border-t border-slate-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-xs font-semibold tracking-widest text-slate-400 mb-4">TRUSTED BY BUSINESSES AND INDIVIDUALS</div>
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
            <Link href="/terms" className="hover:text-slate-900">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link href="/help" className="hover:text-slate-900">Help Center</Link>
            <Link href="/about" className="hover:text-slate-900">About</Link>
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

function FloatingCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`absolute ${className} flex items-center gap-2 sm:gap-3 bg-white rounded-2xl shadow-xl shadow-slate-900/10 px-2.5 py-2 sm:px-3 sm:py-2.5 border border-slate-100 max-w-[60%]`}>
      {children}
    </div>
  );
}

function Step({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
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
