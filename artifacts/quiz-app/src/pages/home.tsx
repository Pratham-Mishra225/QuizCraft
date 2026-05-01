import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetQuizzes, useGetAttempts, getGetQuizzesQueryKey, getGetAttemptsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Layout } from "@/components/layout";
import { PlusCircle, PlayCircle, Trophy, Clock, ArrowRight, Loader2, BrainCircuit } from "lucide-react";
import { format } from "date-fns";

export default function HomePage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const { data: quizzes, isLoading: isQuizzesLoading } = useGetQuizzes({
    query: {
      queryKey: getGetQuizzesQueryKey(),
      enabled: true,
    }
  });

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

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center">
        {/* Hero Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-primary/5 border-b border-primary/10">
          <div className="container px-4 md:px-6 mx-auto flex flex-col items-center text-center space-y-8">
            <div className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4 border border-primary/20">
              <BrainCircuit className="mr-2 h-4 w-4" />
              <span>Sharpen your knowledge</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl max-w-3xl text-balance">
              {isAuthenticated ? `Welcome back, ${user?.username}` : "Master any topic with QuizCraft"}
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl text-balance">
              {isAuthenticated 
                ? "Ready to test your knowledge or create a new challenge? Dive right in."
                : "Create custom quizzes, track your performance, and learn faster through focused practice."}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link href="/quiz/setup">
                <Button size="lg" className="h-12 px-8 text-base shadow-lg hover-elevate group">
                  <PlusCircle className="mr-2 h-5 w-5 transition-transform group-hover:rotate-90" />
                  Create a Quiz
                </Button>
              </Link>
              {!isAuthenticated && (
                <Link href="/auth">
                  <Button size="lg" variant="outline" className="h-12 px-8 text-base bg-background/50 backdrop-blur-sm shadow-sm hover-elevate">
                    Sign In to Track Progress
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Dashboard Section */}
        <div className="container px-4 md:px-6 py-12 mx-auto w-full max-w-6xl space-y-12">
          
          {/* Available Quizzes */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight">Available Quizzes</h2>
                <p className="text-sm text-muted-foreground">Select a quiz to test your knowledge</p>
              </div>
            </div>
            
            {isQuizzesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader className="h-32 bg-muted/50" />
                  </Card>
                ))}
              </div>
            ) : quizzes && quizzes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {quizzes.map((quiz) => (
                  <Card key={quiz.id} className="flex flex-col hover-elevate group overflow-hidden border-2 transition-colors hover:border-primary/50">
                    <CardHeader>
                      <CardTitle className="line-clamp-1">{quiz.title}</CardTitle>
                      <CardDescription className="line-clamp-2 min-h-[40px]">
                        {quiz.description || "No description provided."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <div className="flex items-center text-sm text-muted-foreground bg-muted/30 w-fit px-2.5 py-1 rounded-md">
                        <Clock className="mr-1.5 h-4 w-4 text-primary/70" />
                        {quiz.questions.length} questions
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 pb-6">
                      <Link href={`/quiz/${quiz.id}`} className="w-full">
                        <Button variant="secondary" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Take Quiz
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                  <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                    <Trophy className="size-8 opacity-50" />
                  </div>
                  <h3 className="text-xl font-semibold">No quizzes yet</h3>
                  <p className="text-muted-foreground max-w-sm">Be the first to create a quiz and share your knowledge.</p>
                  <Link href="/quiz/setup">
                    <Button className="mt-4 shadow-sm hover-elevate">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create your first quiz
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Attempts (Auth Only) */}
          {isAuthenticated && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold tracking-tight">Recent Attempts</h2>
                  <p className="text-sm text-muted-foreground">Your past performance</p>
                </div>
                {attempts && attempts.length > 0 && (
                  <Link href="/results">
                    <Button variant="ghost" size="sm" className="hidden sm:flex">
                      View all results <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </div>

              {isAttemptsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2].map(i => (
                    <Card key={i} className="animate-pulse">
                      <CardHeader className="h-24 bg-muted/50" />
                    </Card>
                  ))}
                </div>
              ) : attempts && attempts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {attempts.slice(0, 3).map((attempt) => {
                    const percent = Math.round((attempt.score / attempt.totalQuestions) * 100);
                    return (
                      <Link key={attempt.id} href={`/results/${attempt.id}`}>
                        <Card className="hover-elevate cursor-pointer transition-colors hover:border-primary/50 relative overflow-hidden group">
                          {/* Top indicator line */}
                          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${percent >= 80 ? 'from-green-500 to-emerald-500' : percent >= 60 ? 'from-yellow-400 to-orange-400' : 'from-destructive to-red-600'}`} />
                          
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">{attempt.quizTitle}</CardTitle>
                            <CardDescription>
                              {format(new Date(attempt.completedAt), "MMM d, yyyy")}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-baseline justify-between mt-2">
                              <div className="text-3xl font-bold tracking-tight">
                                {attempt.score} <span className="text-xl text-muted-foreground font-medium">/ {attempt.totalQuestions}</span>
                              </div>
                              <div className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${percent >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : percent >= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                {percent}%
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Card className="border-dashed bg-muted/10">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <Trophy className="size-8 opacity-20 mb-3" />
                    <p>You haven't taken any quizzes yet.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}