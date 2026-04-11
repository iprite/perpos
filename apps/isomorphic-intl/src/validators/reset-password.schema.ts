import { z } from "zod";
import { messages } from "@/config/messages";
import { validateEmail, validatePassword, validateConfirmPassword } from "./common-rules";

// form zod validation schema
export const resetPasswordSchema = (t: (arg: string) => string) =>
  z
    .object({
      email: validateEmail(t),
      password: validatePassword(t),
      confirmPassword: validateConfirmPassword(t),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t(messages.passwordsDidNotMatch),
      path: ["confirmPassword"], // Correct path for the confirmedPassword field
    });

// generate form types from zod validation schema
export type ResetPasswordSchema = z.infer<ReturnType<typeof resetPasswordSchema>>;
