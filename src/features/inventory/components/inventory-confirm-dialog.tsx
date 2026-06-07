"use client";

import { AlertTriangle, Sparkles, Trash2 } from "lucide-react";

export type InventoryConfirmDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type: "info" | "warning" | "danger";
  confirmText?: string;
  cancelText?: string;
};

type InventoryConfirmDialogProps = {
  dialog: InventoryConfirmDialogState;
  onClose: () => void;
};

export function InventoryConfirmDialog({ dialog, onClose }: InventoryConfirmDialogProps) {
  if (!dialog.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden scale-in-95 duration-200 animate-in zoom-in-95">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-slate-100/40 dark:bg-slate-900/30">
          {dialog.type === "danger" ? (
            <div className="p-2 bg-red-500/10 rounded-lg text-red-500 shrink-0">
              <Trash2 className="w-5 h-5 animate-bounce" />
            </div>
          ) : dialog.type === "warning" ? (
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 shrink-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
          ) : (
            <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
          )}
          <h3 className="font-outfit font-extrabold text-base text-foreground">
            {dialog.title}
          </h3>
        </div>

        <div className="p-5 text-sm text-muted-foreground leading-relaxed">
          {dialog.message}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border bg-slate-50/50 dark:bg-slate-950/20">
          {dialog.cancelText && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 flex items-center justify-center border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-[0.98]"
            >
              {dialog.cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              dialog.onConfirm();
            }}
            className={`flex-1 h-11 flex items-center justify-center text-sm font-semibold rounded-lg transition-all active:scale-[0.98] ${
              dialog.type === "danger"
                ? "bg-red-600 text-white hover:bg-red-500"
                : dialog.type === "warning"
                  ? "bg-amber-600 text-white hover:bg-amber-500"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {dialog.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
