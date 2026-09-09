import { z } from "zod";

export const RegisterSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .trim()
    .min(3, "Username must be at least 3 characters long")
    .max(30, "Username must not exceed 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .email("Invalid email address")
    .max(255, "Email is too long"),
  password: z
    .string({ required_error: "Password is required" })
    .min(6, "Password must be at least 6 characters long")
    .max(128, "Password must not exceed 128 characters"),
});

export const LoginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .email("Invalid email address"),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});
