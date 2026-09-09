import { Link, useLocation, useParams } from "wouter";
import { useGetAttempt, getGetAttemptQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle, XCircle, Loader2, Trophy, Calendar, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ResultsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  const { data: attempt, isLoading: isAttemptLoading, error } = useGetAttempt(id || "", {
    query: {
      enabled: isAuthenticated && !!id,
      queryKey: getGetAttemptQueryKey(id || ""),
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
    setLocation("/auth");
    return null;
  }

  if (isAttemptLoading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error || !attempt) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Trophy className="size-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-bold tracking-tight">Result not found</h2>
          <p className="text-muted-foreground mt-2 mb-6">This attempt might have been deleted or doesn't exist.</p>
          <Link href="/results">
            <Button size="lg" className="hover-elevate shadow-sm">Back to Results</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const percent = Math.round((attempt.score / attempt.totalQuestions) * 100);
  const snapshots = attempt.questionSnapshot && attempt.questionSnapshot.length > 0
    ? [...attempt.questionSnapshot].sort((a, b) => a.questionIndex - b.questionIndex)
    : [];

  return (
    <Layout>
      <div className="container max-w-4xl py-10 px-4 md:px-6 mx-auto">
        <div className="mb-8">
          <Button variant="ghost" className="mb-4 -ml-4" asChild>
            <Link href="/results">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Results
            </Link>
          </Button>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Quiz Attempt Details</h1>
              <p className="text-muted-foreground mt-2 text-lg">
                {attempt.quizTitle}
              </p>
            </div>
            <div className="flex items-center text-sm font-medium text-muted-foreground bg-muted/30 w-fit px-3 py-1.5 rounded-md">
              <Calendar className="mr-2 h-4 w-4" />
              {format(new Date(attempt.completedAt), "MMMM d, yyyy 'at' h:mm a")}
            </div>
          </div>
        </div>

        <Card className="border-2 shadow-sm border-primary/10 overflow-hidden mb-8">
          <div className={`h-2 w-full bg-gradient-to-r ${percent >= 80 ? 'from-green-500 to-emerald-500' : percent >= 60 ? 'from-yellow-400 to-orange-400' : 'from-destructive to-red-600'}`} />
          <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className={`p-4 rounded-full ${percent >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : percent >= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                <Trophy className="size-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Final Score</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold tracking-tighter">{attempt.score}</span>
                  <span className="text-xl text-muted-foreground font-medium">/ {attempt.totalQuestions}</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
              <div className="bg-muted/30 p-4 rounded-xl text-center">
                <p className="text-sm font-medium text-muted-foreground mb-1">Percentage</p>
                <p className={`text-2xl font-bold ${percent >= 80 ? 'text-green-600 dark:text-green-400' : percent >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                  {percent}%
                </p>
              </div>
              <div className="bg-muted/30 p-4 rounded-xl text-center">
                <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                <p className="text-xl font-bold">
                  {percent >= 80 ? 'Excellent' : percent >= 60 ? 'Good' : 'Needs Work'}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t p-4 flex justify-between">
            <Button variant="outline" asChild>
              <Link href={`/quiz/${attempt.quizId}`}>
                Retake this quiz
              </Link>
            </Button>
            <Button asChild className="hover-elevate shadow-sm">
              <Link href="/quiz/setup">
                Create new quiz
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <h2 className="text-xl font-semibold tracking-tight mb-6">Question & Answer Review</h2>
        <div className="grid gap-6">
          {snapshots.length > 0 ? (
            snapshots.map((snap, i) => {
              const userAnswer = attempt.answers.find((a) => a.questionIndex === snap.questionIndex);
              const selectedOption = userAnswer?.selectedOption;
              const isCorrect = userAnswer
                ? (userAnswer.isCorrect ?? selectedOption === snap.correctAnswer)
                : false;

              return (
                <Card key={i} className="border-2 overflow-hidden hover-elevate transition-all">
                  <CardHeader className="pb-4 bg-muted/20 border-b flex flex-row items-start justify-between gap-4">
                    <CardTitle className="text-lg font-medium flex items-start gap-3">
                      <span className="mt-0.5 min-w-[28px] text-muted-foreground text-sm font-semibold">
                        #{i + 1}
                      </span>
                      <span>{snap.question}</span>
                    </CardTitle>
                    {isCorrect ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300 border-green-300 dark:border-green-800 flex items-center gap-1 shrink-0">
                        <CheckCircle className="size-3.5" /> Correct
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="flex items-center gap-1 shrink-0">
                        <XCircle className="size-3.5" /> Incorrect
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="pt-4 space-y-3">
                    <div className="grid gap-2">
                      {snap.options.map((opt, optIdx) => {
                        const isSelected = selectedOption === optIdx;
                        const isThisCorrect = snap.correctAnswer === optIdx;

                        let style = "border-muted/60 bg-muted/10 text-muted-foreground";
                        let badgeLabel: string | null = null;

                        if (isSelected && isThisCorrect) {
                          style = "border-green-500 bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-100 font-medium";
                          badgeLabel = "Your Answer (Correct)";
                        } else if (isSelected && !isThisCorrect) {
                          style = "border-red-400 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100 font-medium";
                          badgeLabel = "Your Answer";
                        } else if (isThisCorrect) {
                          style = "border-green-400/80 bg-green-50/50 dark:bg-green-950/20 text-green-800 dark:text-green-200 font-medium";
                          badgeLabel = "Correct Answer";
                        }

                        return (
                          <div
                            key={optIdx}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg border text-sm transition-colors",
                              style
                            )}
                          >
                            <span className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span>{opt}</span>
                            </span>
                            {badgeLabel && (
                              <span className="text-xs px-2 py-0.5 rounded font-semibold shrink-0">
                                {badgeLabel}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {snap.explanation && (
                      <div className="mt-4 p-3.5 rounded-lg bg-muted/40 border text-sm text-muted-foreground flex gap-2.5">
                        <Info className="size-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-foreground">Explanation: </span>
                          <span>{snap.explanation}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            attempt.answers.map((answer, i) => (
              <Card key={i} className="border hover-elevate transition-all">
                <CardHeader className="pb-3 bg-muted/5">
                  <CardTitle className="text-lg font-medium flex items-start gap-3">
                    <span className="mt-0.5 min-w-[24px] text-muted-foreground text-sm">#{i + 1}</span>
                    Question {answer.questionIndex + 1}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm px-3 py-1.5 rounded-md bg-muted/50 border border-border/50 w-full flex items-center justify-between">
                      <span>Selected Option: <strong>{String.fromCharCode(65 + answer.selectedOption)}</strong> (Option {answer.selectedOption + 1})</span>
                      {answer.isCorrect !== undefined && (
                        answer.isCorrect ? (
                          <Badge className="bg-green-100 text-green-800">Correct</Badge>
                        ) : (
                          <Badge variant="destructive">Incorrect</Badge>
                        )
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}