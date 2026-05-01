import { useState } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateQuiz, getGetQuizzesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Save, ArrowLeft, Loader2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";

const optionSchema = z.string().min(1, "Option text is required");

const questionSchema = z.object({
  question: z.string().min(5, "Question must be at least 5 characters"),
  options: z.array(optionSchema).length(4, "Exactly 4 options are required"),
  correctAnswer: z.number().min(0).max(3),
});

const quizSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  questions: z.array(questionSchema).min(1, "At least one question is required"),
});

type QuizFormValues = z.infer<typeof quizSchema>;

export default function QuizSetupPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createQuizMutation = useCreateQuiz();

  const form = useForm<QuizFormValues>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: "",
      description: "",
      questions: [
        {
          question: "",
          options: ["", "", "", ""],
          correctAnswer: 0,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "questions",
    control: form.control,
  });

  if (!isAuthLoading && !isAuthenticated) {
    setLocation("/auth");
    return null;
  }

  const onSubmit = (data: QuizFormValues) => {
    createQuizMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetQuizzesQueryKey() });
          toast({
            title: "Quiz Created!",
            description: "Your quiz is ready to be taken.",
          });
          setLocation(`/quiz/${res.id}`);
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to create quiz",
            description: err.message || "An error occurred.",
          });
        },
      }
    );
  };

  const isPending = createQuizMutation.isPending;

  return (
    <Layout>
      <div className="container max-w-4xl py-10 px-4 md:px-6 mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Button variant="ghost" className="mb-4 -ml-4" onClick={() => setLocation("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Create a New Quiz</h1>
            <p className="text-muted-foreground mt-2">Design your own learning challenge.</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-20">
          <Card className="border-2 shadow-sm border-primary/20">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle>General Information</CardTitle>
              <CardDescription>Give your quiz a title and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label htmlFor="title">Quiz Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Advanced JavaScript Concepts"
                  {...form.register("title")}
                  className={form.formState.errors.title ? "border-destructive" : ""}
                />
                {form.formState.errors.title && (
                  <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="What will this quiz cover?"
                  {...form.register("description")}
                  className="min-h-[100px]"
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
              <span className="text-sm font-medium bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                {fields.length} Question{fields.length !== 1 ? 's' : ''}
              </span>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="relative shadow-sm border-l-4 border-l-primary hover:border-l-primary/70 transition-colors">
                <div className="absolute top-4 right-4">
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <span className="bg-primary/20 text-primary w-6 h-6 rounded-full inline-flex items-center justify-center text-sm mr-2 font-bold">
                      {index + 1}
                    </span>
                    Question setup
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor={`questions.${index}.question`}>Question Text</Label>
                    <Input
                      id={`questions.${index}.question`}
                      placeholder="e.g. What is the output of typeof null in JavaScript?"
                      {...form.register(`questions.${index}.question` as const)}
                    />
                    {form.formState.errors.questions?.[index]?.question && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.questions[index]?.question?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-4 bg-muted/30 p-4 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-base font-semibold">Options & Correct Answer</Label>
                    </div>
                    
                    <RadioGroup 
                      value={form.watch(`questions.${index}.correctAnswer`).toString()}
                      onValueChange={(val) => form.setValue(`questions.${index}.correctAnswer`, parseInt(val, 10))}
                      className="space-y-3"
                    >
                      {[0, 1, 2, 3].map((optIndex) => (
                        <div key={optIndex} className="flex items-center gap-3">
                          <RadioGroupItem 
                            value={optIndex.toString()} 
                            id={`q${index}-opt${optIndex}`}
                            className="mt-1 flex-shrink-0"
                          />
                          <div className="flex-1 space-y-1">
                            <Input
                              placeholder={`Option ${optIndex + 1}`}
                              {...form.register(`questions.${index}.options.${optIndex}` as const)}
                              className={
                                form.watch(`questions.${index}.correctAnswer`) === optIndex 
                                  ? "border-primary/50 bg-primary/5" 
                                  : ""
                              }
                            />
                            {form.formState.errors.questions?.[index]?.options?.[optIndex] && (
                              <p className="text-sm text-destructive">
                                {form.formState.errors.questions[index]?.options?.[optIndex]?.message}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              className="w-full h-14 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground hover-elevate transition-all"
              onClick={() => append({ question: "", options: ["", "", "", ""], correctAnswer: 0 })}
            >
              <PlusCircle className="mr-2 h-5 w-5" />
              Add Another Question
            </Button>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t z-10 flex justify-end">
            <div className="container max-w-4xl mx-auto flex justify-end">
              <Button type="submit" size="lg" className="w-full sm:w-auto h-12 px-8 shadow-lg hover-elevate" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Quiz...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-5 w-5" />
                    Save & Finish
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}