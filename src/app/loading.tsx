import { Loader2, Store } from "lucide-react";

export default function Loading() {
  return (
    <main className="min-h-dvh bg-background flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary/20">
          <Store className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading
        </div>
      </div>
    </main>
  );
}
