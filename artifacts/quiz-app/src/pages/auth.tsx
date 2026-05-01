import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useRegister, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Layout } from "@/components/layout";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = loginSchema.extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
});

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  
  const schema = isLogin ? loginSchema : registerSchema;
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      username: "",
    },
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (isLogin) {
      loginMutation.mutate(
        { data: { email: data.email, password: data.password } },
        {
          onSuccess: (res) => {
            localStorage.setItem("quiz_token", res.token);
            queryClient.setQueryData(getGetMeQueryKey(), res.user);
            toast({
              title: "Welcome back!",
              description: "You have successfully logged in.",
            });
            setLocation("/");
          },
          onError: (err) => {
            toast({
              variant: "destructive",
              title: "Login failed",
              description: err.message || "Please check your credentials and try again.",
            });
          },
        }
      );
    } else {
      registerMutation.mutate(
        { data: data as z.infer<typeof registerSchema> },
        {
          onSuccess: (res) => {
            localStorage.setItem("quiz_token", res.token);
            queryClient.setQueryData(getGetMeQueryKey(), res.user);
            toast({
              title: "Account created!",
              description: "Welcome to QuizCraft.",
            });
            setLocation("/");
          },
          onError: (err) => {
            toast({
              variant: "destructive",
              title: "Registration failed",
              description: err.message || "An error occurred during registration.",
            });
          },
        }
      );
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <Layout>
      <div className="flex-1 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="mx-auto size-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md mb-6">
              <CheckCircle2 className="size-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">QuizCraft</h1>
            <p className="text-muted-foreground">Master any topic, one question at a time.</p>
          </div>

          <Card className="border-2 shadow-xl shadow-primary/5">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">{isLogin ? "Sign in" : "Create an account"}</CardTitle>
              <CardDescription>
                {isLogin ? "Enter your email below to sign in to your account" : "Enter your details below to create your account"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      placeholder="johndoe"
                      {...form.register("username")}
                      aria-invalid={!!form.formState.errors.username}
                      className={form.formState.errors.username ? "border-destructive" : ""}
                    />
                    {form.formState.errors.username && (
                      <p className="text-sm text-destructive">{form.formState.errors.username.message as string}</p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    {...form.register("email")}
                    aria-invalid={!!form.formState.errors.email}
                    className={form.formState.errors.email ? "border-destructive" : ""}
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">{form.formState.errors.email.message as string}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    {...form.register("password")}
                    aria-invalid={!!form.formState.errors.password}
                    className={form.formState.errors.password ? "border-destructive" : ""}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">{form.formState.errors.password.message as string}</p>
                  )}
                </div>
                <Button type="submit" className="w-full h-11 text-base shadow-md hover-elevate" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLogin ? "Sign In" : "Create Account"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 text-sm text-center border-t pt-6 bg-muted/20">
              <div className="text-muted-foreground">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    form.reset();
                  }}
                  className="text-primary font-medium hover:underline hover:text-primary/80 transition-colors"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </Layout>
  );
}