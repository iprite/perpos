"use client";

import { routes } from "@/config/routes";
import { Button } from "rizzui";
import PageHeader from "@/app/shared/page-header";
import ChartWidgets from "@/app/shared/chart-widgets";
import { useTranslations } from "next-intl";

const pageHeader = {
  title: "text-charts",
  breadcrumb: [
    {
      href: routes.eCommerce.dashboard,
      name: "text-home",
    },
    {
      name: "text-widgets",
    },
    {
      name: "text-charts",
    },
  ],
};

export default function ChartsPage() {
  const t = useTranslations("common");

  return (
    <>
      <PageHeader
        title={pageHeader.title}
        breadcrumb={pageHeader.breadcrumb}
      >
        <div className="mt-4 flex items-center gap-3 @lg:mt-0">
          <a
            target="_blank"
            href="https://recharts.org/en-US"
            rel="nofollow noopener noreferrer"
            className="inline-flex w-full @lg:w-auto"
          >
            <Button
              as="span"
              className="w-full @lg:w-auto"
            >
              {t("text-learn-more")}
            </Button>
          </a>
        </div>
      </PageHeader>

      <ChartWidgets />
    </>
  );
}
