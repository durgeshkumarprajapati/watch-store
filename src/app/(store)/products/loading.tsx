export default function CatalogueLoading() {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-10 animate-pulse">
      <div className="h-4 w-36 bg-surface-container rounded mb-6" />
      <div className="pb-8 border-b border-outline mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          <div className="h-10 w-72 bg-surface-container rounded" />
          <div className="h-5 w-96 max-w-full bg-surface-container rounded" />
        </div>
        <div className="h-10 w-48 bg-surface-container rounded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="hidden lg:block lg:col-span-3 h-[540px] bg-surface border border-outline rounded-md" />
        <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface border border-outline rounded overflow-hidden">
              <div className="aspect-[4/5] bg-surface-container" />
              <div className="p-5 flex flex-col gap-2">
                <div className="h-3 w-24 bg-surface-container rounded" />
                <div className="h-5 w-44 bg-surface-container rounded" />
                <div className="h-5 w-28 bg-surface-container rounded mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
