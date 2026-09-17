import { AlertCircle } from "lucide-react";
import { Button } from "./button";
import { Link } from "wouter";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Please try again later.",
  onRetry,
  actionLabel,
  actionHref,
  className = "",
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center space-y-4 ${className}`}>
      <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="size-6 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground max-w-sm text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try Again
        </Button>
      )}
      {actionHref && actionLabel && (
        <Link href={actionHref}>
          <Button>{actionLabel}</Button>
        </Link>
      )}
    </div>
  );
}
