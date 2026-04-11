import { z } from "zod";
import { messages } from "@/config/messages";
import { fileSchema, validateEmail } from "./common-rules";

// form zod validation schema
export const profileFormSchema = (t: (arg: string) => string) =>
  z.object({
    username: z.string().min(1, { message: t(messages.firstNameRequired) }),
    website: z.string().optional(),
    email: validateEmail(t),
    role: z.string({ required_error: t(messages.roleIsRequired) }),
    description: z.string().optional(),
    avatar: fileSchema.optional(),
    portfolios: z.array(fileSchema).optional(),
  });

// generate form types from zod validation schema
export type ProfileFormTypes = z.infer<ReturnType<typeof profileFormSchema>>;

export const defaultValues = {
  username: "Giselle",
  website: undefined,
  email: undefined,
  role: undefined,
  avatar: undefined,
  description: "<p>Similique cupidatat .</p>",
  portfolios: undefined,
};
