"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error("Global route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", padding: 24 }}>
          <section style={{ maxWidth: 420, textAlign: "center" }}>
            <h1>Something went wrong</h1>
            <p>Please refresh the page.</p>
            {unstable_retry && (
              <button
                type="button"
                onClick={() => unstable_retry()}
                style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, border: 0, cursor: "pointer" }}
              >
                Retry
              </button>
            )}
          </section>
        </main>
      </body>
    </html>
  );
}
