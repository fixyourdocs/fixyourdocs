const colors: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800 ring-amber-200',
  acknowledged: 'bg-sky-100 text-sky-800 ring-sky-200',
  fixed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  wontfix: 'bg-slate-100 text-slate-700 ring-slate-200',
  duplicate: 'bg-slate-100 text-slate-700 ring-slate-200',
  spam: 'bg-red-100 text-red-800 ring-red-200',
  verified: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
};

export function StatusPill({ status }: { status: string }) {
  const c = colors[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${c}`}>
      {status}
    </span>
  );
}
