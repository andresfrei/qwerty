import type { ReactNode } from "react";
import { CatalogFormProvider } from "./catalog-form-scope";

// Client lifetime only. Pages/actions still resolve fresh identity and business.
export default function CatalogLayout({ children }: { children: ReactNode }) {
  return <CatalogFormProvider>{children}</CatalogFormProvider>;
}
