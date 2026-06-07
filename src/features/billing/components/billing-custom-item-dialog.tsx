"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { X } from "lucide-react";

type BillingCustomItemDialogProps = {
  customName: string;
  customPrice: string;
  isOpen: boolean;
  onAddCustomToCart: (name: string, price: number) => void;
  onClose: () => void;
  setCustomName: Dispatch<SetStateAction<string>>;
  setCustomPrice: Dispatch<SetStateAction<string>>;
};

export function BillingCustomItemDialog({
  customName,
  customPrice,
  isOpen,
  onAddCustomToCart,
  onClose,
  setCustomName,
  setCustomPrice,
}: BillingCustomItemDialogProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    setCustomName("");
    setCustomPrice("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!customName || !customPrice) return;

    onAddCustomToCart(customName, Number(customPrice));
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md flex flex-col shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <h3 className="font-bold text-sm text-foreground">Add Custom Cart Item</h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Item Name / Description
            </label>
            <input
              type="text"
              required
              maxLength={100}
              placeholder="e.g. Hemming/Alteration, Gift Wrap"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              className="block w-full px-3 h-10 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Price (NPR)
            </label>
            <input
              type="number"
              required
              min={0}
              placeholder="e.g. 150"
              value={customPrice}
              onChange={(event) => setCustomPrice(event.target.value)}
              className="block w-full px-3 h-10 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-white font-bold"
            />
          </div>

          <div className="flex gap-3 pt-3 border-t border-border/40">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 h-10 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 h-10 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-95 shadow transition-all"
            >
              Add to Cart
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
