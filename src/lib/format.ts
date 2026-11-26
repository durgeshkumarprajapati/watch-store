/** Money is stored as integer paise; format with Indian digit grouping. */
export function formatINR(paise: number, opts: { decimals?: boolean } = {}) {
  const rupees = paise / 100;
  return (
    "₹" +
    new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: opts.decimals ? 2 : 0,
      maximumFractionDigits: opts.decimals ? 2 : 0,
    }).format(rupees)
  );
}
