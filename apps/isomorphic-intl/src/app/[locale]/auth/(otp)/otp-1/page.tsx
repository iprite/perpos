import { Text } from "rizzui/typography";
import OtpForm from "./otp-form";
import AuthWrapperOne from "@/app/shared/auth-layout/auth-wrapper-one";
import UnderlineShape from "@core/components/shape/underline";
import Image from "next/image";
import { useTranslations } from "next-intl";

export default function OtpPage() {
  const t = useTranslations("auth");
  return (
    <AuthWrapperOne
      title={
        <>
          {t("auth-enter-your")}{" "}
          <span className="relative inline-block">
            {t("auth-otp")}
            <UnderlineShape className="absolute -bottom-2 end-0 h-2.5 w-16 text-blue xl:-bottom-1 xl:w-24" />
          </span>
        </>
      }
      bannerTitle={t("auth-sign-up-banner-title")}
      bannerDescription={t("auth-sign-up-banner-description")}
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
      <Text className="-mt-1 mb-9 text-center text-[15px] leading-[1.85] text-gray-700 md:text-base md:!leading-loose lg:text-start xl:-mt-6">
        {t("auth-one-time-password")}
      </Text>
      <OtpForm />
    </AuthWrapperOne>
  );
}
