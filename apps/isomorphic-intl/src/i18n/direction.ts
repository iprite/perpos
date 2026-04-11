export function dir(locale: string) {
  const rtlLocales = ["ar"];

  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}
