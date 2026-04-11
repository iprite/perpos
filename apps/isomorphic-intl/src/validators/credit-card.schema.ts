import { z } from "zod";
import { messages } from "@/config/messages";

// form zod validation schema
export const creditCardSchema = (t: (arg: string) => string) =>
  z.object({
    cardHolder: z.string().min(1, { message: t(messages.cardHolderNameIsRequired) }),
    cardNumber: z.string().min(10, { message: t(messages.cardNumberIsRequired) }),
    expiryDate: z.string().min(1, { message: t(messages.cardExpireIsRequired) }),
    cvc: z.string().length(3, { message: t(messages.cvcNumberIsRequired) }),
  });

// generate form types from zod validation schema
export type CreditCardSchema = z.infer<ReturnType<typeof creditCardSchema>>;
