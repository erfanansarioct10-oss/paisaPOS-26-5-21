"use client";

import { AlertTriangle } from "lucide-react";

type InventoryErrorStripProps = {
  errorMsg: string | null;
};

export function InventoryErrorStrip({ errorMsg }: InventoryErrorStripProps) {
  if (!errorMsg) return null;

  return (
    <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-sm flex items-start gap-2.5">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <span>{errorMsg}</span>
    </div>
  );
}
