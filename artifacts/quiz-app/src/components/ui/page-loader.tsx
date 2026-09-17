import { Layout } from "@/components/layout";
import { Loader2 } from "lucide-react";

export function PageLoader() {
  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center min-h-[60vh]" role="status" aria-label="Loading">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    </Layout>
  );
}
