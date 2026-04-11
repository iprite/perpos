import { z } from "zod";
import { validateEmail } from "./common-rules";

// form zod validation schema
export const newsLetterFormSchema = (t: (arg: string) => string) =>
  z.object({
    email: validateEmail(t),
  });

// generate form types from zod validation schema
export type NewsLetterFormSchema = z.infer<ReturnType<typeof newsLetterFormSchema>>;
