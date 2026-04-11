import Image from "next/image";
import SignInForm from "./sign-in-form";
import AuthWrapperOne from "@/app/shared/auth-layout/auth-wrapper-one";
import UnderlineShape from "@core/components/shape/underline";
import { metaObject } from "@/config/site.config";
import { useTranslations } from "next-intl";

export const metadata = {
  ...metaObject("Sign In 1"),
};

export default function SignIn() {
  const t = useTranslations("auth");
  return (
    <AuthWrapperOne
      title={
        <>
          {t("auth-welcome-back")}{" "}
          <span className="relative inline-block">
            {t("auth-sign-in-to")}
            <UnderlineShape className="absolute -bottom-2 start-0 h-2.5 w-24 text-blue md:w-28 xl:-bottom-1.5 xl:w-36" />
          </span>{" "}
          {t("auth-continue")}
        </>
      }
      description={t("auth-sign-up-description")}
      bannerTitle={t("auth-sign-up-banner-title")}
      bannerDescription={t("auth-sign-up-banner-description")}
      isSocialLoginActive={true}
      pageImage={
        <div className="relative mx-auto aspect-[4/3.37] w-[500px] xl:w-[620px] 2xl:w-[820px]">
          <Image
            src={"https://isomorphic-furyroad.s3.amazonaws.com/public/auth/sign-up.webp"}
            alt="Sign Up Thumbnail"
            fill
            priority
            sizes="(max-width: 768px) 100vw"
            className="object-cover"
          />
        </div>
      }
    >
      <SignInForm />
    </AuthWrapperOne>
  );
}
