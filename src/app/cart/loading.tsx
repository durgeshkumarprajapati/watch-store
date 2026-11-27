export default function CartLoading() {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-12 animate-pulse">
      <div className="h-9 w-48 bg-surface-container rounded mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="h-32 bg-surface border border-outline rounded-md" />
          <div className="h-32 bg-surface border border-outline rounded-md" />
        </div>
        <div className="lg:col-span-4 h-64 bg-surface border border-outline rounded-md" />
      </div>
    </div>
  );
}
