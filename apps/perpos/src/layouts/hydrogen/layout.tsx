import Header from "./header";
import Sidebar from "./sidebar";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export default function HydrogenLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-grow">
      <Sidebar className="fixed hidden xl:block dark:bg-gray-50" />
      <div className="flex w-full flex-col xl:ms-[270px] xl:w-[calc(100%-270px)] 2xl:ms-72 2xl:w-[calc(100%-288px)]">
        <Header />
        <div className="flex flex-grow flex-col px-4 pb-6 pt-2 md:px-5 lg:px-6 lg:pb-8 3xl:px-8 3xl:pt-4 4xl:px-10 4xl:pb-9">
          <Breadcrumb />
          {children}
        </div>
        <footer className="border-t border-gray-200 bg-white/70 px-4 py-5 text-sm text-gray-600 backdrop-blur md:px-5 lg:px-6 3xl:px-8 4xl:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 P2P Solutions. All Rights Reserved.</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/privacy" className="hover:text-gray-900">
                นโยบายความเป็นส่วนตัว
              </Link>
              <Link href="/terms" className="hover:text-gray-900">
                ข้อกำหนดการให้บริการ
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
