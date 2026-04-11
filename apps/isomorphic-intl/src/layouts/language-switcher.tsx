"use client";

import SAFlagIcon from "@core/components/icons/language/SAFlag";
import CNFlagIcon from "@core/components/icons/language/CNFlag";
import USFlagIcon from "@core/components/icons/language/USFlag";
import DEFlagIcon from "@core/components/icons/language/DEFlag";
import ESFlagIcon from "@core/components/icons/language/ESFlag";
import cn from "@core/utils/class-names";
import { useLocale } from "next-intl";
import { JSX, useState, useTransition } from "react";
import { Locale, usePathname, useRouter } from "@/i18n/routing";
import AppSelect from "@core/ui/app-select";

type LocaleOptionsType = {
  label: string;
  value: Locale;
  icon: ({ ...props }: React.SVGProps<SVGSVGElement>) => JSX.Element;
};

const localeOptions = [
  {
    label: "English - EN",
    value: "en",
    icon: USFlagIcon,
  },
  {
    label: "عربى - AR",
    value: "ar",
    icon: SAFlagIcon,
  },
  {
    label: "中国人 - ZH",
    value: "zh",
    icon: CNFlagIcon,
  },
  {
    label: "Deutsch - DE",
    value: "de",
    icon: DEFlagIcon,
  },
  {
    label: "Español - ES",
    value: "es",
    icon: ESFlagIcon,
  },
];

export default function LanguageSwitcher({
  className,
  iconClassName,
  selectClassName,
}: {
  className?: string;
  iconClassName?: string;
  selectClassName?: string;
}) {
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();
  const [_, startTransition] = useTransition();
  const selectedLocale = localeOptions.filter(
    (item) => item.value.toLowerCase() === locale.toLowerCase()
  );
  const [selected, setSelected] = useState(selectedLocale[0]);

  function handleChange(op: LocaleOptionsType) {
    setSelected(op);
    startTransition(() => {
      router.replace(`${pathname}`, { locale: op.value });
    });
  }

  return (
    <AppSelect
      size="sm"
      value={selected}
      className={cn("w-auto", className)}
      placement="bottom-end"
      onChange={handleChange}
      options={localeOptions}
      dropdownClassName="w-40"
      suffixClassName={iconClassName}
      selectClassName={cn(
        "w-auto h-[34px] md:h-9 ring-0 border-none shadow backdrop-blur-md dark:bg-gray-100",
        selectClassName
      )}
      displayValue={(op: LocaleOptionsType) => renderDisplayValue(op)}
      getOptionDisplayValue={(op: LocaleOptionsType) =>
        renderOptionDisplayValue(op)
      }
    />
  );
}

function renderDisplayValue(op: LocaleOptionsType) {
  const Icon = op.icon;
  return <>{Icon && <Icon className="size-5" />}</>;
}

function renderOptionDisplayValue(op: LocaleOptionsType) {
  const Icon = op.icon;
  return (
    <div className="flex items-center gap-3">
      {Icon && <Icon className="size-5" />}
      <span>{op.label}</span>
    </div>
  );
}
