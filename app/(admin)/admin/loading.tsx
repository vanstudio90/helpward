/*
  WHAT A CLICK LOOKS LIKE BEFORE THE DATA ARRIVES.

  Every admin section reads from the database on the server, so there
  is a moment between clicking the sidebar and the page appearing. With
  no boundary here, Next.js holds the OLD page on screen for that
  moment: the sidebar highlights the new section while the previous
  section's content sits underneath it, which reads as a freeze rather
  than as loading.

  This changes nothing about any page. It is what the browser shows
  while the real one is on its way — the same shell, the same
  proportions, so the layout does not jump when the content lands.
*/
export default function AdminSectionLoading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto animate-pulse"
      aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading this section…</span>

      {/* Heading */}
      <div className="h-7 w-56 rounded-lg bg-slate-200" />
      <div className="h-4 w-80 rounded bg-slate-100 mt-2" />

      {/* Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-6 w-14 rounded bg-slate-200 mt-2" />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <div className="h-9 flex-1 min-w-[220px] rounded-xl bg-white border border-slate-200" />
        <div className="h-9 w-32 rounded-xl bg-white border border-slate-200" />
        <div className="h-9 w-32 rounded-xl bg-white border border-slate-200" />
      </div>

      {/* The list */}
      <div className="bg-white rounded-2xl border border-slate-200 mt-4 overflow-hidden">
        <div className="h-9 bg-slate-50 border-b border-slate-100" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
            <div className="h-8 w-8 rounded-lg bg-slate-100 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-3.5 w-1/3 rounded bg-slate-200" />
              <div className="h-3 w-1/4 rounded bg-slate-100 mt-1.5" />
            </div>
            <div className="h-5 w-20 rounded-full bg-slate-100 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
