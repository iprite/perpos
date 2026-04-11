import { z } from "zod";
import { messages } from "@/config/messages";

export const fileSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.number(),
});

export type FileSchema = z.infer<typeof fileSchema>;

export const validateEmail = (t: (arg: string) => string) =>
  z
    .string()
    .min(1, { message: t(messages.emailIsRequired) })
    .email({ message: t(messages.invalidEmail) });

export const validatePassword = (t: (arg: string) => string) =>
  z
    .string()
    .min(1, { message: t(messages.passwordRequired) })
    .min(6, { message: t(messages.passwordLengthMin) })
    .regex(new RegExp(".*[A-Z].*"), {
      message: t(messages.passwordOneUppercase),
    })
    .regex(new RegExp(".*[a-z].*"), {
      message: t(messages.passwordOneLowercase),
    })
    .regex(new RegExp(".*\\d.*"), { message: t(messages.passwordOneNumeric) });

export const validateNewPassword = (t: (arg: string) => string) =>
  z
    .string()
    .min(1, { message: t(messages.passwordRequired) })
    .min(6, { message: t(messages.passwordLengthMin) })
    .regex(new RegExp(".*[A-Z].*"), {
      message: t(messages.passwordOneUppercase),
    })
    .regex(new RegExp(".*[a-z].*"), {
      message: t(messages.passwordOneLowercase),
    })
    .regex(new RegExp(".*\\d.*"), { message: t(messages.passwordOneNumeric) });

export const validateConfirmPassword = (t: (arg: string) => string) =>
  z
    .string()
    .min(1, { message: t(messages.confirmPasswordRequired) })
    .min(6, { message: t(messages.passwordLengthMin) })
    .regex(new RegExp(".*[A-Z].*"), {
      message: t(messages.passwordOneUppercase),
    })
    .regex(new RegExp(".*[a-z].*"), {
      message: t(messages.passwordOneLowercase),
    })
    .regex(new RegExp(".*\\d.*"), { message: t(messages.passwordOneNumeric) });
