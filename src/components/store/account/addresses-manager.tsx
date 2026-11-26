"use client";

import { useState, useTransition } from "react";
import type { CustomerAddress } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  addAddressAction,
  makeDefaultAddressAction,
  removeAddressAction,
} from "@/modules/customers/actions";

export function AddressesManager({ addresses }: { addresses: CustomerAddress[] }) {
  const [label, setLabel] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addAddressAction({
        label,
        addressLine1,
        addressLine2,
        city,
        state: stateName,
        pinCode,
        isDefault,
      });
      if (res.ok) {
        setLabel("");
        setAddressLine1("");
        setAddressLine2("");
        setCity("");
        setStateName("");
        setPinCode("");
        setIsDefault(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
        <h2 className="font-headline text-headline-md text-on-surface border-b border-outline pb-4">
          Saved Delivery Addresses ({addresses.length})
        </h2>

        {addresses.length === 0 ? (
          <p className="font-body text-body-md text-on-surface-variant">
            No saved addresses yet. Add a delivery address below.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div key={addr.id} className="border border-outline rounded p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-title text-title-md text-on-surface">
                      {addr.label || "Delivery Address"}
                    </span>
                    {addr.isDefault && <Badge tone="primary">Default</Badge>}
                  </div>
                  <p className="font-body text-body-md text-on-surface-variant">{addr.addressLine1}</p>
                  {addr.addressLine2 && (
                    <p className="font-body text-body-md text-on-surface-variant">{addr.addressLine2}</p>
                  )}
                  <p className="font-body text-body-md text-on-surface-variant">
                    {addr.city}, {addr.state} — <span className="font-mono">{addr.pinCode}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-outline">
                  {!addr.isDefault && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(async () => { await makeDefaultAddressAction(addr.id); })}
                      className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary hover:underline"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(async () => { await removeAddressAction(addr.id); })}
                    className="font-label text-label-sm uppercase tracking-wider text-error hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <form onSubmit={handleAdd} className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
        <h3 className="font-headline text-headline-md text-on-surface">Add New Address</h3>
        {error && <p role="alert" className="font-body text-body-md text-error">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Home, Office)"
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
          <input
            type="text"
            required
            maxLength={6}
            inputMode="numeric"
            value={pinCode}
            onChange={(e) => setPinCode(e.target.value)}
            placeholder="6-digit PIN Code"
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono text-mono-md text-on-surface outline-none focus:border-primary"
          />
          <input
            type="text"
            required
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="Street address, building"
            className="sm:col-span-2 px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
          <input
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder="Apartment / Landmark (optional)"
            className="sm:col-span-2 px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
          <input
            type="text"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
          <input
            type="text"
            required
            value={stateName}
            onChange={(e) => setStateName(e.target.value)}
            placeholder="State"
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded-sm border-outline text-primary accent-primary"
          />
          <span className="font-body text-body-md text-on-surface">Set as default delivery address</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="self-start px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add Address"}
        </button>
      </form>
    </div>
  );
}
