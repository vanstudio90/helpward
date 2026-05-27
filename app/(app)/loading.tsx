export default function Loading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded mb-2" />
      <div className="h-4 w-72 bg-slate-100 rounded mb-6" />
      <div className="h-12 w-full bg-slate-100 rounded-2xl mb-5" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-slate-100 rounded-2xl" />
        ))}
      </div>
      <div className="h-64 bg-slate-100 rounded-2xl" />
    </div>
  );
}
