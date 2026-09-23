import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pdf-parse` wraps `pdfjs-dist`, which loads its own worker file
  // (`pdf.worker.mjs`) via a runtime path lookup that doesn't survive
  // Turbopack/webpack bundling the server action that imports it —
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
  // Marking both packages external means Node resolves them straight
  // from node_modules at request time instead, same as any other
  // server-only Node dependency this app doesn't bundle.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    // Dynamic routes (everything here — auth-gated, RLS-scoped) default
    // to a 0s client cache, meaning every navigation, even a page you
    // just visited, re-fetches from the server and shows loading.tsx.
    // 20s means a page you're actively moving between (dashboard <->
    // lessons <-> students, ...) reuses what's already in the browser
    // instead of flashing the skeleton every time. Your own mutations
    // still invalidate this immediately via revalidatePath(); the only
    // gap is a different signed-in person's change taking up to 20s to
    // show if you revisit without triggering your own refresh.
    staleTimes: {
      dynamic: 20,
    },
  },
};

export default nextConfig;
