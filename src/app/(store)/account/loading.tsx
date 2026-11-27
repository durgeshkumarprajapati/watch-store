export default function AccountLoading() {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-12 animate-pulse">
      <div className="h-24 bg-surface border border-outline rounded-md mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 h-72 bg-surface border border-outline rounded-md" />
        <div className="lg:col-span-9 h-72 bg-surface border border-outline rounded-md" />
      </div>
    </div>
  );
}
