"use client";

import { Link } from "@/i18n/routing";
import { useState } from "react";
import { PiPaperPlaneRightFill } from "react-icons/pi";
import { SubmitHandler } from "react-hook-form";
import { Button, Input } from "rizzui";
import { Form } from "@core/ui/form";
import { NewsLetterFormSchema, newsLetterFormSchema } from "@/validators/newsletter.schema";
import { useTranslations } from "next-intl";

const initialValues = {
  email: "",
};

export default function NewsLetterForm() {
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
              className="absolute right-1 top-1 aspect-square w-12 !p-0  text-base font-medium"
              size="lg"
              rounded="pill"
            >
              <PiPaperPlaneRightFill className="-mr-1 h-5 w-5" />
            </Button>
          </div>
        )}
      </Form>
      <div className="mt-4 flex justify-center">
        <Link
          href={"/"}
          className="text-center text-base font-medium text-gray-700 underline decoration-gray-700 underline-offset-2"
        >
          {t("form-no-thanks")}
        </Link>
      </div>
    </>
  );
}
