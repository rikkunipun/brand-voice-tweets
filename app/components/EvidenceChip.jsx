export const EVIDENCE = {
  'user-defined': {
    label: 'user-defined',
    meaning: 'You typed it in the form.',
    classes: 'bg-violet-100 text-violet-800 ring-violet-300',
  },
  'supported-by-examples': {
    label: 'supported-by-examples',
    meaning: 'Visible in the past posts you pasted.',
    classes: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  },
  'web-supported': {
    label: 'web-supported',
    meaning: "Seen in the brand's own posts or campaigns found online.",
    classes: 'bg-sky-100 text-sky-800 ring-sky-300',
  },
  inferred: {
    label: 'inferred',
    meaning: 'Our reasoning from the category, the brief or commentary. The weakest evidence.',
    classes: 'bg-slate-100 text-slate-700 ring-slate-300',
  },
};

export function EvidenceChip({ evidence }) {
  const e = EVIDENCE[evidence] || EVIDENCE.inferred;
  return (
    <span
      title={e.meaning}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${e.classes}`}
    >
      {e.label}
    </span>
  );
}

export function EvidenceLegend() {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {Object.values(EVIDENCE).map((e) => (
        <div key={e.label} className="flex items-start gap-2">
          <dt className="pt-0.5">
            <EvidenceChip evidence={e.label} />
          </dt>
          <dd className="text-muted">{e.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
