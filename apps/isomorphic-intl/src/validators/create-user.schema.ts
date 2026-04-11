import { z } from "zod";
import { messages } from "@/config/messages";
import { validateEmail } from "./common-rules";

// form zod validation schema
export const createUserSchema = (t: (arg: string) => string) =>
  z.object({
    fullName: z.string().min(1, { message: messages.fullNameIsRequired }),
    email: validateEmail(t),
    role: z.string().min(1, { message: messages.roleIsRequired }),
    permissions: z.string().min(1, { message: messages.permissionIsRequired }),
    status: z.string().min(1, { message: messages.statusIsRequired }),
  });

// generate form types from zod validation schema
export type CreateUserInput = z.infer<ReturnType<typeof createUserSchema>>;
