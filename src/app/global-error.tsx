"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
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
          </section>
        </main>
      </body>
    </html>
  );
}
