const privateHeaders = [
  { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate, max-age=0" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

/** @type {import('next').NextConfig} */
const config = {
  // The receipt parser is a killable Node child, not a bundled request module.
  // Keep its original entry and package/native dependencies in deployment traces.
  serverExternalPackages: ["sharp", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/checkout/receipts{,/*}": [
      "./app/lib/receipt-file-worker.mjs",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/sharp/**/*",
      "../../node_modules/.pnpm/@img+sharp*/**/*",
      "../../node_modules/.pnpm/@napi-rs+canvas*/**/*",
    ],
  },
  async headers() {
    return [
      { source: "/owner/:path*", headers: privateHeaders },
      { source: "/auth/:path*", headers: privateHeaders },
    ];
  },
};

export default config;
