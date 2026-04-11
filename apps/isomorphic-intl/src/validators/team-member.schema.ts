import { z } from "zod";
import { messages } from "@/config/messages";
import { validateEmail } from "./common-rules";

// form zod validation schema
export const addTeamMemberSchema = (t: (arg: string) => string) =>
  z.object({
    first_name: z.string().min(1, { message: t(messages.firstNameRequired) }),
    last_name: z.string().optional(),
    email: validateEmail(t),
    role: z.string({ required_error: t(messages.roleIsRequired) }),
    country: z.string().optional(),
    teams: z.string({ required_error: t(messages.teamIsRequired) }),
  });

// generate form types from zod validation schema
export type AddTeamMemberInput = z.infer<ReturnType<typeof addTeamMemberSchema>>;
