import type { NextConfig } from "next";

const STORAGE_BUCKET = "product-images";

/**
 * Manual-product uploads land in the Supabase Storage bucket above and are
 * served from `<project>/storage/v1/object/public/<bucket>/<path>`.
 *
 * `next/image` rejects any host that is not listed in `images.remotePatterns`,
 * so the project's public API host is derived from NEXT_PUBLIC_SUPABASE_URL.
 * That variable is public by definition (the browser already talks to it), and
 * the project ref is also hardcoded as a fallback for the case where `.env`
 * files are not loaded while this config is evaluated.
 */
function storageRemotePatterns() {
  const candidates: string[] = ["nygydondwrifdrdnwiqs.supabase.co"];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    try {
      candidates.push(new URL(url).hostname);
    } catch {
      // Not a URL — the hardcoded ref above still covers the project.
    }
  }

  const hostnames = [...new Set(candidates)].filter((value) => value.length > 0);

  return hostnames.map((hostname) => ({
    protocol: "https" as const,
    hostname,
    port: "",
    pathname: `/storage/v1/object/public/${STORAGE_BUCKET}/**`,
    search: "",
  }));
}

const nextConfig: NextConfig = {
  // Do not advertise the framework.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "safka.fra1.cdn.digitaloceanspaces.com",
      },
      ...storageRemotePatterns(),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;