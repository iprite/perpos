import { z } from "zod";
import { validateEmail } from "./common-rules";

// form zod validation schema
export const forgetPasswordSchema = (t: (arg: string) => string) =>
  z.object({
    email: validateEmail(t),
  });

// generate form types from zod validation schema
export type ForgetPasswordSchema = z.infer<ReturnType<typeof forgetPasswordSchema>>;
