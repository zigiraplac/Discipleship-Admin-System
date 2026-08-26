"use client";

import { useEffect } from "react";

/**
 * Catches an error thrown by the root layout itself — the one case
 * error.tsx can't cover, since error.tsx renders *inside* that layout.
 * Next.js requires this to render its own <html>/<body>; it can't assume
 * the app's normal layout (and its stylesheet) ever mounted, so this
 * stays plain, inline-styled, and dependency-free on purpose.
 */
export default function GlobalRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#f4f6f8",
          color: "#1c2733",
        }}
      >
        <div
          style={{
            maxWidth: 380,
            width: "100%",
            margin: "0 24px",
            padding: 32,
            borderRadius: 16,
            border: "1px solid #d7dde4",
            background: "#ffffff",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>Something went wrong</div>
          <p style={{ marginTop: 8, fontSize: 13, color: "#56626f", lineHeight: 1.5 }}>
            The app hit an unexpected error loading this page. It&rsquo;s been logged — try reloading.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              width: "100%",
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#35608f",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
