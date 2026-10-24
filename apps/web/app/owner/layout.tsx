import type { Metadata } from "next";
import type { ReactNode } from "react";

// Owner HTML only. Native logout retains the existing server-side CSRF policy.
export const metadata: Metadata = { referrer: "same-origin" };
export default function OwnerLayout({ children }: { children: ReactNode }) {
  return children;
}
