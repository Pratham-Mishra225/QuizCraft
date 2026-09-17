import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <AlertCircle className="size-8 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">404 - Page Not Found</h1>
        <p className="mt-2 text-muted-foreground max-w-md text-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/" className="mt-6">
          <Button className="gap-2">
            <Home className="size-4" />
            Back to Home
          </Button>
        </Link>
      </div>
    </Layout>
  );
}

