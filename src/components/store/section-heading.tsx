export function SectionHeading({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5 lg:mb-10">
      <div>
        {eyebrow && (
          <span className="hidden lg:block font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">{eyebrow}</span>
        )}
        <h2 className="font-headline text-display-md-mobile lg:text-display-md text-on-background lg:mt-1">{title}</h2>
      </div>
      {actions}
    </div>
  );
}
