export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded mb-2" />
      <div className="h-4 w-72 bg-slate-100 rounded mb-6" />
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="h-24 bg-slate-100 rounded-card" />
        <div className="h-24 bg-slate-100 rounded-card" />
        <div className="h-24 bg-slate-100 rounded-card" />
      </div>
      <div className="h-48 bg-slate-100 rounded-card" />
    </div>
  );
}
