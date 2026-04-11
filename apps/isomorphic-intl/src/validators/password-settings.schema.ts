import { z } from "zod";
import { messages } from "@/config/messages";
import { validatePassword, validateNewPassword, validateConfirmPassword } from "./common-rules";

// form zod validation schema
export const passwordFormSchema = (t: (arg: string) => string) =>
  z
    .object({
      currentPassword: validatePassword(t),
      newPassword: validateNewPassword(t),
      confirmedPassword: validateConfirmPassword(t),
    })
    .refine((data) => data.newPassword === data.confirmedPassword, {
      message: messages.passwordsDidNotMatch,
      path: ["confirmedPassword"], // Correct path for the confirmedPassword field
    });

// generate form types from zod validation schema
export type PasswordFormTypes = z.infer<ReturnType<typeof passwordFormSchema>>;
