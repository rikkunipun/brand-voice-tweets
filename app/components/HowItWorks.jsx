export default function HowItWorks() {
  const steps = [
    ['Research (optional)', "If you give a brand name, a web search looks for the brand's own posts and campaigns. What the brand said itself is kept apart from what others say about it."],
    ['Voice Card', 'Your details, pasted posts and research become a structured card. Every trait carries an evidence label, and your explicit instructions always win a conflict.'],
    ['Mix plan', 'The campaign objective sets the split between engaging, promotional, witty and informative tweets. Each slot also gets its own angle and theme, so the ten tweets do not repeat one idea.'],
    ['Writing', 'One tweet per slot, following the card and using only facts from your brief.'],
    ['Automated checks', 'Plain code (not a model) checks length, emoji and hashtag limits, avoided words, clichés, invented numbers, repeated phrases and openings, and how often the brand name appears.'],
    ['Editor pass', 'A second model pass rewrites weak tweets. A rewrite is kept only if it adds no new check failures anywhere in the set.'],
  ];
  return (
    <details className="group rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <summary className="cursor-pointer list-none text-base font-semibold marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
        How this works
      </summary>
      <ol className="mt-4 space-y-3 text-sm">
        {steps.map(([name, text], i) => (
          <li key={name} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{i + 1}</span>
            <span><span className="font-medium">{name}.</span> <span className="text-muted">{text}</span></span>
          </li>
        ))}
      </ol>
    </details>
  );
}
