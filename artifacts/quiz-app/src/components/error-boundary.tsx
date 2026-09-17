import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <div className="max-w-md w-full p-6 text-center space-y-4 rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="size-12 rounded-full bg-destructive/10 mx-auto flex items-center justify-center">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Please reload the page or return to the home screen.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
                <RefreshCcw className="size-4" />
                Reload
              </Button>
              <Button onClick={this.handleReset}>Go Home</Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
