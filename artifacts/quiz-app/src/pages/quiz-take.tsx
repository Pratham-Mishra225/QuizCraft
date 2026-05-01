import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useGetQuiz, useSubmitQuiz, getGetQuizQueryKey, getGetAttemptsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function QuizTakePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const { data: quiz, isLoading: isQuizLoading, error: quizError } = useGetQuiz(id || "", {
    query: {
      enabled: !!id,
      queryKey: getGetQuizQueryKey(id || ""),
    }
  });

  const submitMutation = useSubmitQuiz();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

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
  const progress = ((currentIndex) / quiz.questions.length) * 100;
  const isLastQuestion = currentIndex === quiz.questions.length - 1;
  const currentAnswer = answers[currentIndex];
  const hasAnsweredCurrent = currentAnswer !== undefined;

  const handleNext = () => {
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
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
        }
      }
    );
  };

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
              {quiz.description && <p className="text-muted-foreground mt-2">{quiz.description}</p>}
            </div>
            <div className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full whitespace-nowrap">
              Question {currentIndex + 1} of {quiz.questions.length}
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="border-2 shadow-lg flex-1 flex flex-col">
          <CardHeader className="bg-muted/30 pb-6">
            <CardTitle className="text-2xl font-medium leading-relaxed">
              {currentQuestion.question}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex-1">
            <RadioGroup
              value={currentAnswer !== undefined ? currentAnswer.toString() : ""}
              onValueChange={(val) => setAnswers({ ...answers, [currentIndex]: parseInt(val, 10) })}
              className="space-y-4"
            >
              {currentQuestion.options.map((option, idx) => (
                <div key={idx} className="flex items-center space-x-3">
                  <RadioGroupItem value={idx.toString()} id={`option-${idx}`} className="peer sr-only" />
                  <Label
                    htmlFor={`option-${idx}`}
                    className="flex flex-1 items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                  >
                    <span className="text-base font-medium">{option}</span>
                    {currentAnswer === idx && <CheckCircle className="h-5 w-5 text-primary" />}
                  </Label>
                </div>
              ))}
            </RadioGroup>
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
                disabled={!hasAnsweredCurrent || submitMutation.isPending || Object.keys(answers).length !== quiz.questions.length}
                className="shadow-sm hover-elevate"
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
                className="shadow-sm hover-elevate"
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