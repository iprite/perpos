"use client";

import { useMemo, useState } from "react";
import { getColumns } from "@/app/shared/account-settings/logged-in-devices/columns";
import { useTable } from "@core/hooks/use-table";
import { useColumn } from "@core/hooks/use-column";
import ControlledTable from "@/app/shared/controlled-table";
import { useTranslations } from "next-intl";

export default function LoggedInDevices({
  className,
  data = [],
}: {
  className?: string;
  data: any[];
}) {
  const [pageSize, setPageSize] = useState(10);
  const t = useTranslations("table");
  const onHeaderCellClick = (value: string) => ({
    onClick: () => {
      handleSort(value);
    },
  });
  const onDeleteItem = (id: string) => handleDelete(id);

  const {
    isLoading,
    tableData,
    currentPage,
    totalItems,
    handlePaginate,
    sortConfig,
    handleSort,
    selectedRowKeys,
    handleRowSelect,
    handleSelectAll,
    handleDelete,
  } = useTable(data, pageSize, data);

  const columns = useMemo(
    () =>
      getColumns({
        data,
        sortConfig,
        checkedItems: selectedRowKeys,
        onHeaderCellClick,
        onChecked: handleRowSelect,
        handleSelectAll,
        onDeleteItem,
        t,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectedRowKeys,
      onHeaderCellClick,
      sortConfig.key,
      sortConfig.direction,
      onDeleteItem,
      handleRowSelect,
      handleSelectAll,
    ]
  );
  const { visibleColumns } = useColumn(columns);

  return (
    <div className={className}>
      <ControlledTable
        isLoading={isLoading}
        data={tableData}
        // @ts-ignore
        columns={visibleColumns}
        variant="modern"
        rowKey={(record) => record.id}
        className="w-full text-sm"
        paginatorOptions={{
          pageSize,
          setPageSize,
          total: totalItems,
          current: currentPage,
          onChange: (page: number) => handlePaginate(page),
        }}
      />
    </div>
  );
}
