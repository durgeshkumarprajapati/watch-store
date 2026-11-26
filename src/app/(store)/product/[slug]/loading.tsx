export default function ProductDetailsLoading() {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-10 animate-pulse flex flex-col gap-14">
      <div>
        <div className="h-4 w-56 bg-surface-container rounded mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="aspect-[4/3] bg-surface-container rounded" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square bg-surface-container rounded" />
              ))}
            </div>
          </div>
          <div className="lg:col-span-5 h-[520px] bg-surface border border-outline rounded-md" />
        </div>
      </div>
    </div>
  );
}
