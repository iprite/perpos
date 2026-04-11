"use client";

import { PiCaretDownBold } from "react-icons/pi";
import { Select, type SelectOption, type SelectProps } from "rizzui";
import cn from "../utils/class-names";

export type AppSelectProps<OptionType extends SelectOption> = Omit<
  SelectProps<OptionType>,
  "rounded" | "variant" | "size" | "shadow" | "suffix"
> & {
  rounded?: SelectProps<OptionType>["rounded"];
  variant?: SelectProps<OptionType>["variant"];
  size?: SelectProps<OptionType>["size"];
  shadow?: SelectProps<OptionType>["shadow"];
  suffix?: SelectProps<OptionType>["suffix"];
};

export default function AppSelect<OptionType extends SelectOption>({
  className,
  labelClassName,
  selectClassName,
  dropdownClassName,
  optionClassName,
  searchContainerClassName,
  searchClassName,
  searchPlaceHolder,
  prefixClassName,
  suffixClassName,
  errorClassName,
  helperClassName,
  rounded = "pill",
  variant = "outline",
  size = "md",
  shadow = "md",
  suffix,
  gap = 8,
  inPortal = true,
  placement = "bottom-start",
  searchable,
  stickySearch,
  searchByKey,
  searchType,
  ...props
}: AppSelectProps<OptionType>) {
  const isTextVariant = variant === "text";
  const optionCount = Array.isArray(props.options) ? props.options.length : 0;
  const effectiveSearchable = searchable ?? optionCount > 7;
  const effectiveStickySearch = effectiveSearchable ? (stickySearch ?? true) : false;

  return (
    <Select
      {...props}
      searchable={effectiveSearchable}
      stickySearch={effectiveStickySearch}
      searchByKey={searchByKey ?? "label"}
      searchType={searchType ?? "search"}
      searchPlaceHolder={searchPlaceHolder ?? "ค้นหา..."}
      searchContainerClassName={cn(
        "sticky top-0 z-10 bg-white p-2 pb-1",
        searchContainerClassName
      )}
      searchClassName={cn(
        "h-10 w-full rounded-lg border border-gray-200 bg-white !pl-9 pr-3 text-sm text-gray-800",
        "placeholder:text-gray-400",
        "focus:border-blue-600 focus:ring-2 focus:ring-blue-200",
        searchClassName
      )}
      inPortal={inPortal}
      placement={placement}
      gap={gap}
      rounded={rounded}
      variant={variant}
      size={size}
      shadow={shadow}
      className={cn(
        "[&_.select-value]:text-gray-800",
        "[&_.text-muted-foreground]:text-gray-500",
        className
      )}
      labelClassName={cn("text-xs font-medium text-gray-900", labelClassName)}
      selectClassName={cn(
        !isTextVariant && "bg-white",
        !isTextVariant && "border-gray-200",
        !isTextVariant && "hover:border-gray-300",
        !isTextVariant && "focus:border-gray-300",
        "ring-0 hover:ring-0 focus:ring-0",
        !isTextVariant && "h-11",
        !isTextVariant && "px-5",
        !isTextVariant && "py-0",
        "text-sm",
        selectClassName
      )}
      dropdownClassName={cn(
        "!z-50",
        "rounded-2xl",
        "border border-gray-100",
        "bg-white",
        "p-0",
        "shadow-lg",
        "grid",
        "gap-1",
        "!h-auto",
        "!min-h-0",
        "max-h-60",
        "overflow-auto",
        dropdownClassName
      )}
      optionClassName={cn(
        "h-10",
        "px-4",
        "py-0",
        "rounded-lg",
        "text-sm",
        "text-gray-800",
        "data-[headlessui-state~=active]:!bg-gray-50",
        "data-[headlessui-state~=selected]:!bg-gray-100",
        optionClassName
      )}
      prefixClassName={cn(prefixClassName)}
      suffixClassName={cn("text-gray-400", suffixClassName)}
      errorClassName={cn("text-xs text-red-500", errorClassName)}
      helperClassName={cn("text-xs text-gray-500", helperClassName)}
      suffix={
        suffix ?? (
          <PiCaretDownBold className="h-4 w-4" aria-hidden="true" />
        )
      }
    />
  );
}
