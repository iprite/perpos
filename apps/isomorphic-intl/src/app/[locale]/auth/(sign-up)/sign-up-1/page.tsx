import Image from "next/image";
import UnderlineShape from "@core/components/shape/underline";
import SignUpForm from "./sign-up-form";
import AuthWrapperOne from "@/app/shared/auth-layout/auth-wrapper-one";
import { metaObject } from "@/config/site.config";
import { useTranslations } from "next-intl";

export const metadata = {
  ...metaObject("Sign Up 1"),
};

export default function SignUp() {
  const t = useTranslations("auth");
  return (
    <AuthWrapperOne
      title={
        <>
          {t("auth-join-us-and-never-miss")} -{" "}
          <span className="relative inline-block">
            {t("auth-sign-up")}
            <UnderlineShape className="absolute -bottom-2 start-0 h-2.5 w-28 text-blue xl:-bottom-1.5 xl:w-36" />
          </span>
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
      <SignUpForm />
    </AuthWrapperOne>
  );
}
