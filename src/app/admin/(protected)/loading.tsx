export default function AdminSectionLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-64 bg-surface-container rounded" />
        <div className="h-4 w-96 max-w-full bg-surface-container rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface border border-outline rounded-md" />
        ))}
      </div>
      <div className="h-80 bg-surface border border-outline rounded-md" />
    </div>
  );
}
