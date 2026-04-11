import { z } from "zod";
import { messages } from "@/config/messages";
import { validateEmail, validatePassword, validateConfirmPassword } from "./common-rules";

// form zod validation schema
export const signUpSchema = (t: (arg: string) => string) =>
  z.object({
    firstName: z.string().min(1, { message: messages.firstNameRequired }),
    lastName: z.string().optional(),
    email: validateEmail(t),
    password: validatePassword(t),
    confirmPassword: validateConfirmPassword(t),
    isAgreed: z.boolean(),
  });

// generate form types from zod validation schema
export type SignUpSchema = z.infer<ReturnType<typeof signUpSchema>>;
