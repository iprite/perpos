import { LangProvider } from './_lang-context';

export default function UsvillaLayout({ children }: { children: React.ReactNode }) {
  return <LangProvider>{children}</LangProvider>;
}
