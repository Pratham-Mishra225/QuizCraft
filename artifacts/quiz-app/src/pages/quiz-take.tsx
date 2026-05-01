import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetQuiz,
  useSubmitQuiz,
  getGetQuizQueryKey,
  getGetAttemptsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Info,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export default function QuizTakePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const { data: quiz, isLoading: isQuizLoading, error: quizError } = useGetQuiz(id || "", {
    query: { enabled: !!id, queryKey: getGetQuizQueryKey(id || "") },
  });

  const submitMutation = useSubmitQuiz();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  if (!isAuthLoading && !isAuthenticated) {
    setLocation("/auth");
    return null;
  }

  if (isQuizLoading || isAuthLoading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (quizError || !quiz) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <h2 className="text-2xl font-bold">Quiz Not Found</h2>
          <Button onClick={() => setLocation("/")}>Return Home</Button>
        </div>
      </Layout>
    );
  }

  const currentQuestion = quiz.questions[currentIndex];
  const progress = (currentIndex / quiz.questions.length) * 100;
  const isLastQuestion = currentIndex === quiz.questions.length - 1;
  const currentAnswer = answers[currentIndex];
  const hasAnsweredCurrent = currentAnswer !== undefined;
  const isRevealed = revealed[currentIndex];

  const handleOptionSelect = (idx: number) => {
    if (isRevealed) return;
    setAnswers((prev) => ({ ...prev, [currentIndex]: idx }));
    setRevealed((prev) => ({ ...prev, [currentIndex]: true }));
  };

  const handleNext = () => {
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = () => {
    const formattedAnswers = Object.entries(answers).map(([qIndex, selectedOption]) => ({
      questionIndex: parseInt(qIndex, 10),
      selectedOption,
    }));

    submitMutation.mutate(
      { id: quiz.id, data: { answers: formattedAnswers } },
      {
        onSuccess: (attempt) => {
          queryClient.invalidateQueries({ queryKey: getGetAttemptsQueryKey() });
          toast({
            title: "Quiz Submitted!",
            description: `You scored ${attempt.score} out of ${attempt.totalQuestions}.`,
          });
          setLocation(`/results/${attempt.id}`);
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Submission failed",
            description: err.message || "An error occurred while submitting your answers.",
          });
        },
      }
    );
  };

  const getOptionStyle = (idx: number) => {
    if (!isRevealed) {
      return "border-muted bg-popover hover:bg-accent hover:text-accent-foreground cursor-pointer";
    }
    const isCorrect = idx === currentQuestion.correctAnswer;
    const isSelected = idx === currentAnswer;
    if (isCorrect) return "border-green-500 bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-100";
    if (isSelected && !isCorrect) return "border-red-400 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100";
    return "border-muted bg-muted/30 opacity-60";
  };

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === quiz.questions.length;
  const explanation = (currentQuestion as { explanation?: string }).explanation;
  const isCorrectAnswer = hasAnsweredCurrent && currentAnswer === currentQuestion.correctAnswer;

  return (
    <Layout>
      <div className="container max-w-3xl py-10 px-4 md:px-6 mx-auto flex-1 flex flex-col">
        <div className="mb-8">
          <Button variant="ghost" className="mb-4 -ml-4" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Quit Quiz
          </Button>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{quiz.title}</h1>
              {quiz.description && (
                <p className="text-muted-foreground mt-2">{quiz.description}</p>
              )}
            </div>
            <div className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full whitespace-nowrap">
              {currentIndex + 1} / {quiz.questions.length}
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {answeredCount} of {quiz.questions.length} answered
          </p>
        </div>

        <Card className="border-2 shadow-lg flex-1 flex flex-col">
          <CardHeader className="bg-muted/30 pb-6">
            <CardTitle className="text-2xl font-medium leading-relaxed">
              {currentQuestion.question}
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-6 flex-1 space-y-4">
            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleOptionSelect(idx)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-xl border-2 p-4 text-left transition-all",
                    getOptionStyle(idx)
                  )}
                  disabled={isRevealed}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-base font-medium">{option}</span>
                  </span>
                  {isRevealed && idx === currentQuestion.correctAnswer && (
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  )}
                  {isRevealed && idx === currentAnswer && idx !== currentQuestion.correctAnswer && (
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  )}
                  {!isRevealed && (
                    <Label htmlFor={`option-${idx}`} className="sr-only">
                      {option}
                    </Label>
                  )}
                </button>
              ))}
            </div>

            {isRevealed && (
              <div
                className={cn(
                  "flex gap-3 p-4 rounded-xl border text-sm mt-4",
                  isCorrectAnswer
                    ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                    : "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isCorrectAnswer ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-orange-500" />
                  )}
                </div>
                <div>
                  <p className={cn("font-semibold mb-1", isCorrectAnswer ? "text-green-800 dark:text-green-200" : "text-orange-800 dark:text-orange-200")}>
                    {isCorrectAnswer ? "Correct!" : `Incorrect — the correct answer is "${currentQuestion.options[currentQuestion.correctAnswer]}"`}
                  </p>
                  {explanation && (
                    <p className={cn("leading-relaxed", isCorrectAnswer ? "text-green-700 dark:text-green-300" : "text-orange-700 dark:text-orange-300")}>
                      <Info className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                      {explanation}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="border-t bg-muted/10 pt-6 flex justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentIndex === 0 || submitMutation.isPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>

            {isLastQuestion ? (
              <Button
                onClick={handleSubmit}
                disabled={!allAnswered || submitMutation.isPending}
                className="shadow-sm"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Answers <CheckCircle className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!hasAnsweredCurrent}
                className="shadow-sm"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </Layout>
  );
}
