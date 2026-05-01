import { Link } from "wouter";
import { useGetAttempts, getGetAttemptsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { BarChart2, Calendar, Trophy, ArrowRight, Loader2, ArrowLeft } from "lucide-react";

export default function ResultsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  const { data: attempts, isLoading: isAttemptsLoading } = useGetAttempts({
    query: {
      queryKey: getGetAttemptsQueryKey(),
      enabled: isAuthenticated,
    }
  });

  if (isAuthLoading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Trophy className="size-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-bold tracking-tight">Sign in to view results</h2>
          <p className="text-muted-foreground mt-2 mb-6">You need an account to track your quiz performance.</p>
          <Link href="/auth">
            <Button size="lg" className="hover-elevate shadow-sm">Sign In</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const totalTaken = attempts?.length || 0;
  const averageScore = attempts?.length 
    ? Math.round(attempts.reduce((acc, curr) => acc + (curr.score / curr.totalQuestions), 0) / attempts.length * 100)
    : 0;

  return (
    <Layout>
      <div className="container max-w-5xl py-10 px-4 md:px-6 mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Button variant="ghost" className="mb-4 -ml-4" asChild>
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
              </Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Performance Results</h1>
            <p className="text-muted-foreground mt-2">Track your learning progress over time.</p>
          </div>
          
          <div className="flex gap-4">
            <Card className="bg-primary/5 border-primary/20 shadow-sm min-w-[140px]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <BarChart2 className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Average Score</p>
                  <p className="text-2xl font-bold">{averageScore}%</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-primary/5 border-primary/20 shadow-sm min-w-[140px]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Trophy className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Quizzes Taken</p>
                  <p className="text-2xl font-bold">{totalTaken}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">Attempt History</h2>
          
          {isAttemptsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="h-24 bg-muted/50" />
                </Card>
              ))}
            </div>
          ) : attempts && attempts.length > 0 ? (
            <div className="grid gap-4">
              {attempts.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()).map((attempt) => {
                const percent = Math.round((attempt.score / attempt.totalQuestions) * 100);
                
                return (
                  <Link key={attempt.id} href={`/results/${attempt.id}`}>
                    <Card className="hover-elevate cursor-pointer transition-colors hover:border-primary/50 group overflow-hidden relative">
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${percent >= 80 ? 'from-green-500 to-emerald-500' : percent >= 60 ? 'from-yellow-400 to-orange-400' : 'from-destructive to-red-600'}`} />
                      <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1 ml-2">
                          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-1">
                            {attempt.quizTitle}
                          </h3>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Calendar className="mr-1.5 h-3.5 w-3.5" />
                            {format(new Date(attempt.completedAt), "MMM d, yyyy 'at' h:mm a")}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6 ml-2 sm:ml-0">
                          <div className="text-right">
                            <div className="text-2xl font-bold tracking-tight">
                              {attempt.score} <span className="text-base font-normal text-muted-foreground">/ {attempt.totalQuestions}</span>
                            </div>
                            <div className={`text-xs font-semibold uppercase tracking-wider ${percent >= 80 ? 'text-green-600 dark:text-green-400' : percent >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                              {percent}% Score
                            </div>
                          </div>
                          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <ArrowRight className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <Trophy className="size-12 opacity-20 mb-2" />
                <h3 className="text-lg font-semibold">No attempts yet</h3>
                <p className="text-muted-foreground max-w-sm">Take your first quiz to start tracking your performance.</p>
                <Link href="/">
                  <Button className="mt-2 shadow-sm hover-elevate">
                    Browse Quizzes
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}