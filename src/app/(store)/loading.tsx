export default function StoreHomeLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-[440px] lg:h-[560px] bg-surface-container border-b border-outline" />
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8 lg:py-16">
        <div className="h-8 w-56 bg-surface-container rounded mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] bg-surface border border-outline rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
