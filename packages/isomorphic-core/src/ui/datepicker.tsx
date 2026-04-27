"use client";

import { useMemo, useState } from "react";
import { Input, InputProps } from "rizzui";
import cn from "../utils/class-names";
import { PiCalendarBlank, PiCaretDown } from "react-icons/pi";
import ReactDatePicker, {
  type DatePickerProps as ReactDatePickerProps,
} from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const calendarContainerClasses = {
  base: cn(
    "[&.react-datepicker]:w-[360px]",
    "[&.react-datepicker]:max-w-[calc(100vw-2rem)]",
    "[&.react-datepicker]:rounded-2xl",
    "[&.react-datepicker]:border [&.react-datepicker]:border-gray-200",
    "[&.react-datepicker]:bg-white",
    "[&.react-datepicker]:shadow-xl",
    "[&.react-datepicker]:p-5",
    "[&_.react-datepicker__header]:border-b-0 [&_.react-datepicker__header]:bg-white",
    "[&_.react-datepicker__header]:p-0",
    "[&_.react-datepicker__header]:relative",
    "[&_.react-datepicker__current-month]:mb-5",
    "[&_.react-datepicker__current-month]:text-center",
    "[&_.react-datepicker__current-month]:text-xl",
    "[&_.react-datepicker__current-month]:font-semibold",
    "[&_.react-datepicker__current-month]:text-gray-900",
    "[&_.react-datepicker__day-names]:mt-0",
    "[&_.react-datepicker__day-names]:flex",
    "[&_.react-datepicker__day-names]:justify-between",
    "[&_.react-datepicker__day-name]:w-10",
    "[&_.react-datepicker__day-name]:text-center",
    "[&_.react-datepicker__day-name]:text-sm",
    "[&_.react-datepicker__day-name]:font-medium",
    "[&_.react-datepicker__day-name]:text-gray-700",
    "[&_.react-datepicker__month]:mt-4",
    "[&_.react-datepicker__week]:flex",
    "[&_.react-datepicker__week]:justify-between",
    "[&_.react-datepicker__day]:m-0",
    "[&_.react-datepicker__day]:h-10",
    "[&_.react-datepicker__day]:w-10",
    "[&_.react-datepicker__day]:rounded-full",
    "[&_.react-datepicker__day]:text-center",
    "[&_.react-datepicker__day]:text-sm",
    "[&_.react-datepicker__day]:leading-10",
    "[&_.react-datepicker__day]:text-gray-700",
    "[&_.react-datepicker__day:hover]:bg-gray-100",
    "[&_.react-datepicker__day--outside-month]:text-gray-300",
    "[&_.react-datepicker__day--disabled]:text-gray-300",
    "[&_.react-datepicker__day--disabled:hover]:bg-transparent",
    "[&_.react-datepicker__day--selected]:bg-white",
    "[&_.react-datepicker__day--selected]:text-gray-900",
    "[&_.react-datepicker__day--selected]:border",
    "[&_.react-datepicker__day--selected]:border-gray-300",
    "[&_.react-datepicker__day--keyboard-selected]:bg-white",
    "[&_.react-datepicker__day--keyboard-selected]:text-gray-900",
    "[&_.react-datepicker__day--keyboard-selected]:border",
    "[&_.react-datepicker__day--keyboard-selected]:border-gray-300"
  ),
};

const timeOnlyClasses = {
  base: "[&.react-datepicker--time-only>div]:pr-0 [&.react-datepicker--time-only>div]:w-28",
};

const popperClasses = {
  base: "!z-[2147483647] [&>svg]:!fill-white dark:[&>svg]:!fill-gray-100 [&>svg]:!stroke-gray-300 dark:[&>svg]:!stroke-muted dark:[&>svg]:!text-muted",
};

export type DatePickerProps = ReactDatePickerProps & {
  inputProps?: InputProps;
};

export const DatePicker = ({
  inputProps,
  customInput,
  onCalendarOpen,
  onCalendarClose,
  popperClassName,
  calendarClassName,
  renderCustomHeader,
  dateFormat = "d MMMM yyyy",
  showPopperArrow = false,
  portalId = "react-datepicker-portal",
  ...props
}: DatePickerProps) => {
  const [isCalenderOpen, setIsCalenderOpen] = useState(false);
  const [isEditingYear, setIsEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState("");
  const handleCalenderOpen = () => setIsCalenderOpen(true);
  const handleCalenderClose = () => setIsCalenderOpen(false);

  const monthFormatter = useMemo(() => new Intl.DateTimeFormat("th-TH", { month: "long" }), []);

  const mergedInputProps: InputProps = {
    size: "md",
    variant: "outline",
    placeholder: props.placeholderText,
    ...inputProps,
    className: cn(
      "[&>label>span]:text-xs",
      "[&>label>span]:font-medium",
      "[&>label>span]:text-gray-900",
      inputProps?.className
    ),
    inputClassName: cn(
      "!h-10",
      "!text-sm",
      "placeholder:text-gray-400",
      "border-gray-200",
      "hover:border-gray-300",
      "focus:border-gray-300",
      "ring-0",
      "hover:ring-0",
      "focus:ring-0",
      "shadow-none",
      inputProps?.inputClassName
    ),
  };

  return (
    <div
      className={cn(
        "flex [&_.react-datepicker-wrapper]:flex [&_.react-datepicker-wrapper]:w-full",
        props?.className
      )}
    >
      <ReactDatePicker
        customInput={
          customInput || (
            <Input
              prefix={<PiCalendarBlank className="w-5 h-5 text-gray-500" />}
              suffix={
                <PiCaretDown
                  className={cn(
                    "h-4 w-4 text-gray-500 transition",
                    isCalenderOpen && "rotate-180"
                  )}
                />
              }
              {...mergedInputProps}
            />
          )
        }
        onCalendarOpen={onCalendarOpen || handleCalenderOpen}
        onCalendarClose={onCalendarClose || handleCalenderClose}
        renderCustomHeader={
          renderCustomHeader ||
          ((p) => (
            <div className="grid h-14 grid-cols-[26px_1fr_26px] items-center px-3">
              <button
                type="button"
                onClick={p.decreaseMonth}
                disabled={p.prevMonthButtonDisabled}
                aria-label="Previous month"
                className={cn(
                  "h-[26px] w-[26px] rounded-md border border-gray-200 bg-white text-gray-400",
                  "hover:bg-gray-50",
                  "disabled:opacity-40 disabled:hover:bg-white"
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" className="mx-auto h-4 w-4" aria-hidden="true">
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div className="flex items-center justify-center gap-2 text-center text-xl font-semibold text-gray-900">
                <div>{monthFormatter.format(p.date)}</div>
                {isEditingYear ? (
                  <input
                    inputMode="numeric"
                    className="h-8 w-[92px] rounded-md border border-gray-200 bg-white px-2 text-center text-sm font-semibold text-gray-900 outline-none"
                    value={yearDraft}
                    onChange={(e) => setYearDraft(e.target.value)}
                    autoFocus
                    onBlur={() => {
                      const n = Number(String(yearDraft ?? "").trim());
                      if (Number.isFinite(n)) {
                        const adYear = n >= 2400 ? n - 543 : n;
                        if (Number.isFinite(adYear) && adYear >= 1900 && adYear <= 3000) {
                          p.changeYear(Math.trunc(adYear));
                        }
                      }
                      setIsEditingYear(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setIsEditingYear(false);
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const n = Number(String(yearDraft ?? "").trim());
                        if (Number.isFinite(n)) {
                          const adYear = n >= 2400 ? n - 543 : n;
                          if (Number.isFinite(adYear) && adYear >= 1900 && adYear <= 3000) {
                            p.changeYear(Math.trunc(adYear));
                          }
                        }
                        setIsEditingYear(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="rounded-md px-1 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    onClick={() => {
                      setYearDraft(String(p.date.getFullYear() + 543));
                      setIsEditingYear(true);
                    }}
                  >
                    พ.ศ. {p.date.getFullYear() + 543}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={p.increaseMonth}
                disabled={p.nextMonthButtonDisabled}
                aria-label="Next month"
                className={cn(
                  "h-[26px] w-[26px] rounded-md border border-gray-200 bg-white text-gray-400",
                  "hover:bg-gray-50",
                  "disabled:opacity-40 disabled:hover:bg-white"
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" className="mx-auto h-4 w-4" aria-hidden="true">
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ))
        }
        calendarClassName={cn(
          calendarContainerClasses.base,
          timeOnlyClasses.base,
          calendarClassName
        )}
        popperClassName={cn(popperClasses.base, popperClassName)}
        portalId={portalId}
        dateFormat={dateFormat}
        showPopperArrow={showPopperArrow}
        {...props}
      />
    </div>
  );
};
