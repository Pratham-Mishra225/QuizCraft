import { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useGetAttempt, getGetAttemptQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout";
import { PageLoader } from "@/components/ui/page-loader";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  Trophy,
  Calendar,
  Info,
  RotateCcw,
  PlusCircle,
  History,
  ListFilter,
  Check,
  X,
  HelpCircle,
  FileText,
} from "lucide-react";

import { cn } from "@/lib/utils";

type FilterMode = "all" | "correct" | "incorrect";

export default function ResultsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [filter, setFilter] = useState<FilterMode>("all");

  const { data: attempt, isLoading: isAttemptLoading, error } = useGetAttempt(id || "", {
    query: {
      enabled: isAuthenticated && !!id,
      queryKey: getGetAttemptQueryKey(id || ""),
    },
  });

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation("/auth");
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  const percent = useMemo(() => {
    if (!attempt || !attempt.totalQuestions || attempt.totalQuestions <= 0) return 0;
    return Math.round((attempt.score / attempt.totalQuestions) * 100);
  }, [attempt]);

  const snapshots = useMemo(() => {
    if (!attempt?.questionSnapshot || attempt.questionSnapshot.length === 0) return [];
    return [...attempt.questionSnapshot].sort((a, b) => a.questionIndex - b.questionIndex);
  }, [attempt]);

  const questionEvaluations = useMemo(() => {
    if (!attempt) return [];
    return snapshots.map((snap, idx) => {
      const userAnswer = attempt.answers?.find((a) => a.questionIndex === snap.questionIndex);
      const selectedOption = userAnswer?.selectedOption;
      const isAnswered = selectedOption !== undefined && selectedOption >= 0 && selectedOption < snap.options.length;
      const isCorrect = isAnswered && (userAnswer?.isCorrect ?? (selectedOption === snap.correctAnswer));

      return {
        snap,
        displayNumber: idx + 1,
        selectedOption,
        isAnswered,
        isCorrect,
      };
    });
  }, [attempt, snapshots]);

  const counts = useMemo(() => {
    const total = questionEvaluations.length;
    const correct = questionEvaluations.filter((q) => q.isCorrect).length;
    const incorrect = total - correct;
    return { total, correct, incorrect };
  }, [questionEvaluations]);

  const filteredQuestions = useMemo(() => {
    if (filter === "correct") return questionEvaluations.filter((q) => q.isCorrect);
    if (filter === "incorrect") return questionEvaluations.filter((q) => !q.isCorrect);
    return questionEvaluations;
  }, [questionEvaluations, filter]);

  if (isAuthLoading || isAttemptLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (error || !attempt) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Trophy className="size-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-bold tracking-tight">Result Not Found</h2>
          <p className="text-muted-foreground mt-2 mb-6 max-w-md">
            This quiz attempt could not be found or you do not have permission to view it.
          </p>
          <Link href="/results">
            <Button size="lg" className="hover-elevate shadow-sm">
              <History className="mr-2 size-4" /> Back to History
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const formattedDate = attempt.completedAt
    ? format(new Date(attempt.completedAt), "MMMM d, yyyy 'at' h:mm a")
    : "Recently completed";

  return (
    <Layout>
      <div className="container max-w-4xl py-10 px-4 md:px-6 mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" className="-ml-4" asChild>
            <Link href="/results">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to History
            </Link>
          </Button>
          <Link href="/">
            <Button variant="outline" size="sm">
              Browse All Quizzes
            </Button>
          </Link>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-2">
                Quiz Result Review
              </div>
              <h1 className="text-3xl font-bold tracking-tight">{attempt.quizTitle}</h1>
            </div>
            <div className="flex items-center text-sm font-medium text-muted-foreground bg-muted/40 w-fit px-3 py-1.5 rounded-lg border border-border/50">
              <Calendar className="mr-2 h-4 w-4 text-primary" />
              {formattedDate}
            </div>
          </div>
        </div>

        {/* Top Summary Banner Card */}
        <Card className="border-2 shadow-sm border-primary/15 overflow-hidden mb-8">
          <div
            className={`h-2.5 w-full bg-gradient-to-r ${
              percent >= 80
                ? "from-green-500 via-emerald-500 to-teal-500"
                : percent >= 60
                ? "from-amber-400 via-yellow-500 to-orange-500"
                : "from-red-500 via-rose-500 to-destructive"
            }`}
          />
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left Score Block */}
              <div className="flex items-center gap-5">
                <div
                  className={`p-4 rounded-2xl flex items-center justify-center shrink-0 ${
                    percent >= 80
                      ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                      : percent >= 60
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                  }`}
                >
                  <Trophy className="size-9" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Final Score
                  </p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-4xl font-extrabold tracking-tight">{attempt.score}</span>
                    <span className="text-xl text-muted-foreground font-medium">
                      / {attempt.totalQuestions}
                    </span>
                  </div>
                </div>
              </div>

              {/* Middle Metrics */}
              <div className="grid grid-cols-2 gap-3 w-full lg:w-auto">
                <div className="bg-muted/30 border border-border/50 p-4 rounded-xl text-center min-w-[120px]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Accuracy
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      percent >= 80
                        ? "text-green-600 dark:text-green-400"
                        : percent >= 60
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {percent}%
                  </p>
                </div>
                <div className="bg-muted/30 border border-border/50 p-4 rounded-xl text-center min-w-[120px]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Performance
                  </p>
                  <p className="text-lg font-bold">
                    {percent >= 80 ? "Excellent" : percent >= 60 ? "Good Effort" : "Needs Practice"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          {/* Card Footer Actions */}
          <CardFooter className="bg-muted/10 border-t p-4 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" asChild className="hover-elevate">
              <Link href={`/quiz/${attempt.quizId}`}>
                <RotateCcw className="mr-2 size-4" /> Retake Quiz
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link href="/results">
                  <History className="mr-2 size-4" /> Attempt History
                </Link>
              </Button>
              <Button asChild className="hover-elevate shadow-sm">
                <Link href="/quiz/setup">
                  <PlusCircle className="mr-2 size-4" /> Create New Quiz
                </Link>
              </Button>
            </div>
          </CardFooter>
        </Card>

        {/* Section Header & Filters */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Question Review</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review your answers, see correct solutions, and read detailed explanations.
            </p>
          </div>

          {/* Filter Pills */}
          {questionEvaluations.length > 0 && (
            <div className="flex items-center p-1 bg-muted/40 border border-border/60 rounded-xl self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                  filter === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setFilter("correct")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1",
                  filter === "correct"
                    ? "bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300 shadow-sm"
                    : "text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
                )}
              >
                <Check className="size-3" /> Correct ({counts.correct})
              </button>
              <button
                type="button"
                onClick={() => setFilter("incorrect")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1",
                  filter === "incorrect"
                    ? "bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 shadow-sm"
                    : "text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                )}
              >
                <X className="size-3" /> Incorrect ({counts.incorrect})
              </button>
            </div>
          )}
        </div>

        {/* Questions List */}
        <div className="space-y-6">
          {questionEvaluations.length > 0 ? (
            filteredQuestions.length > 0 ? (
              filteredQuestions.map(({ snap, displayNumber, selectedOption, isAnswered, isCorrect }) => {
                const userSelectedText =
                  isAnswered && selectedOption !== undefined && snap.options[selectedOption]
                    ? `${String.fromCharCode(65 + selectedOption)}. ${snap.options[selectedOption]}`
                    : "Not answered";

                const correctText =
                  snap.correctAnswer !== undefined && snap.options[snap.correctAnswer]
                    ? `${String.fromCharCode(65 + snap.correctAnswer)}. ${snap.options[snap.correctAnswer]}`
                    : "N/A";

                const hasExplanation = Boolean(snap.explanation && snap.explanation.trim().length > 0);

                return (
                  <Card
                    key={snap.questionIndex}
                    className={cn(
                      "border-2 overflow-hidden hover-elevate transition-all shadow-sm",
                      isCorrect
                        ? "border-green-200/80 dark:border-green-900/40"
                        : "border-red-200/80 dark:border-red-900/40"
                    )}
                  >
                    {/* Question Card Header */}
                    <CardHeader
                      className={cn(
                        "pb-4 border-b flex flex-row items-start justify-between gap-4",
                        isCorrect
                          ? "bg-green-50/40 dark:bg-green-950/20"
                          : "bg-red-50/40 dark:bg-red-950/20"
                      )}
                    >
                      <CardTitle className="text-lg font-semibold flex items-start gap-3 leading-relaxed">
                        <span className="mt-0.5 px-2 py-0.5 rounded-md bg-muted text-foreground text-xs font-bold shrink-0">
                          Q{displayNumber}
                        </span>
                        <span>{snap.question}</span>
                      </CardTitle>

                      {/* Status Badge */}
                      {isCorrect ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-300 border-green-300 dark:border-green-800 flex items-center gap-1.5 shrink-0 px-2.5 py-1 text-xs font-bold">
                          <CheckCircle className="size-4 text-green-600 dark:text-green-400" />
                          <span>✓ Correct</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 text-xs font-bold bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800"
                        >
                          <XCircle className="size-4 text-red-600 dark:text-red-400" />
                          <span>✗ Incorrect</span>
                        </Badge>
                      )}
                    </CardHeader>

                    {/* Options List */}
                    <CardContent className="pt-5 space-y-4">
                      <div className="space-y-2.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          Available Options
                        </p>
                        {snap.options.map((opt, optIdx) => {
                          const isUserSelection = isAnswered && selectedOption === optIdx;
                          const isCorrectOption = snap.correctAnswer === optIdx;

                          let optionStyle =
                            "border-muted/60 bg-muted/10 text-muted-foreground hover:bg-muted/20";
                          let badgeText: string | null = null;
                          let badgeStyle = "";

                          if (isUserSelection && isCorrectOption) {
                            optionStyle =
                              "border-green-500 bg-green-50/80 dark:bg-green-950/40 text-green-950 dark:text-green-100 font-semibold ring-1 ring-green-500/30";
                            badgeText = "Your Answer (Correct)";
                            badgeStyle = "bg-green-600 text-white dark:bg-green-500 dark:text-black";
                          } else if (isUserSelection && !isCorrectOption) {
                            optionStyle =
                              "border-red-400 bg-red-50/80 dark:bg-red-950/40 text-red-950 dark:text-red-100 font-semibold ring-1 ring-red-400/30";
                            badgeText = "Your Answer";
                            badgeStyle = "bg-red-600 text-white dark:bg-red-500 dark:text-white";
                          } else if (isCorrectOption) {
                            optionStyle =
                              "border-green-500/80 bg-green-50/40 dark:bg-green-950/20 text-green-900 dark:text-green-200 font-semibold border-dashed";
                            badgeText = "Correct Answer";
                            badgeStyle =
                              "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-400/50";
                          }

                          return (
                            <div
                              key={optIdx}
                              className={cn(
                                "flex items-center justify-between p-3.5 rounded-xl border text-sm transition-all",
                                optionStyle
                              )}
                            >
                              <span className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0",
                                    isUserSelection || isCorrectOption
                                      ? "border-current"
                                      : "border-muted-foreground/40 text-muted-foreground"
                                  )}
                                >
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="leading-snug">{opt}</span>
                              </span>
                              {badgeText && (
                                <span
                                  className={cn(
                                    "text-xs px-2.5 py-0.5 rounded-full font-bold shrink-0 shadow-2xs",
                                    badgeStyle
                                  )}
                                >
                                  {badgeText}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Explicit Answer Comparison Box */}
                      <div className="pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-muted/30 border border-border/60 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                              Your Selection:
                            </span>
                            <span
                              className={cn(
                                "font-bold text-sm",
                                isCorrect ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                              )}
                            >
                              {userSelectedText}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                              Correct Solution:
                            </span>
                            <span className="font-bold text-sm text-green-600 dark:text-green-400">
                              {correctText}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Explanation Callout (Rendered only when non-empty) */}
                      {hasExplanation && (
                        <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/15 text-sm text-foreground/90 flex gap-3">
                          <Info className="size-4 text-primary shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="font-bold text-xs uppercase tracking-wider text-primary">
                              Explanation
                            </p>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {snap.explanation}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Source Attribution for RAG / PDF-generated quizzes */}
                      {snap.source?.pageNumber && (
                        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/40 w-fit px-3 py-1.5 rounded-lg border border-border/60">
                          <FileText className="size-3.5 text-primary" />
                          <span className="font-medium">
                            Source: Page {snap.source.pageNumber}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );

              })
            ) : (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <ListFilter className="size-10 opacity-30" />
                  <p className="text-base font-semibold">No questions match the selected filter</p>
                  <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                    Show All Questions
                  </Button>
                </CardContent>
              </Card>
            )
          ) : (
            // Legacy Attempt Fallback
            attempt.answers?.map((answer, i) => (
              <Card key={i} className="border hover-elevate transition-all">
                <CardHeader className="pb-3 bg-muted/5">
                  <CardTitle className="text-base font-medium flex items-start gap-3">
                    <span className="mt-0.5 min-w-[24px] text-muted-foreground text-xs font-bold">
                      #{i + 1}
                    </span>
                    Question {answer.questionIndex + 1}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50 text-sm">
                    <span>
                      Selected Option: <strong>{String.fromCharCode(65 + answer.selectedOption)}</strong> (Option {answer.selectedOption + 1})
                    </span>
                    {answer.isCorrect !== undefined && (
                      answer.isCorrect ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                          ✓ Correct
                        </Badge>
                      ) : (
                        <Badge variant="destructive">✗ Incorrect</Badge>
                      )
                    )}
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