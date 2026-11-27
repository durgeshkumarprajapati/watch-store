export default function CheckoutLoading() {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-12 animate-pulse">
      <div className="h-9 w-56 bg-surface-container rounded mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="h-48 bg-surface border border-outline rounded-md" />
          <div className="h-56 bg-surface border border-outline rounded-md" />
        </div>
        <div className="lg:col-span-5 h-72 bg-surface border border-outline rounded-md" />
      </div>
    </div>
  );
}
