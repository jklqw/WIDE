import { z } from "zod";

export const RegisterRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(128),
  displayName: z.string().min(1).max(80),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  status: z.enum(["active", "disabled"]),
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const AuthSessionSchema = z.object({
  user: UserProfileSchema,
  csrfToken: z.string(),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;
