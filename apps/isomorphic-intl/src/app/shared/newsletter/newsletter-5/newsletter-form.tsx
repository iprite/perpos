"use client";

import { useState } from "react";
import { SubmitHandler } from "react-hook-form";
import { Button, Input } from "rizzui";
import { Form } from "@core/ui/form";
import { NewsLetterFormSchema, newsLetterFormSchema } from "@/validators/newsletter.schema";
import { useTranslations } from "next-intl";

const initialValues = {
  email: "",
};

export default function NewsLetterForm({ className }: { className?: string }) {
  const [reset, setReset] = useState({});
  const t = useTranslations("form");

  const onSubmit: SubmitHandler<NewsLetterFormSchema> = (data) => {
    console.log(data);
    setReset(initialValues);
  };
  return (
    <>
      <Form<NewsLetterFormSchema>
        validationSchema={newsLetterFormSchema(t)}
        resetValues={reset}
        onSubmit={onSubmit}
        useFormProps={{
          defaultValues: initialValues,
        }}
      >
        {({ register, formState: { errors } }) => (
          <div className="relative mx-auto max-w-lg">
            <Input
              placeholder={t("form-email-placeholder")}
              inputClassName="w-full text-base pr-36"
              size="xl"
              rounded="pill"
              {...register("email")}
              error={errors.email?.message}
            />
            <Button
              type="submit"
              className="absolute right-1 top-1 text-base font-medium"
              size="lg"
              rounded="pill"
            >
              {t("form-subscribe")}
            </Button>
          </div>
        )}
      </Form>
      <p className="mt-4 text-center text-sm font-medium text-gray-500 @2xl:text-base">
        {t("form-email-is-safe")}
      </p>
    </>
  );
}
