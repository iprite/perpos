import { z } from "zod";
import { messages } from "@/config/messages";
import { validateEmail } from "./common-rules";

export const emailTemplateSchema = (t: (arg: string) => string) =>
  z.object({
    name: z.string().min(1, { message: messages.nameIsRequired }),
    email: validateEmail(t),
  });

// generate form types from zod validation schema
export type EmailTemplateInput = z.infer<ReturnType<typeof emailTemplateSchema>>;
