"use client";

import { type Table as ReactTableType } from "@tanstack/react-table";
import {
  ActionIcon,
  Flex,
  Select,
  SelectOption,
  Text,
} from "rizzui";
import {
  PiCaretLeftBold,
  PiCaretRightBold,
  PiCaretDoubleLeftBold,
  PiCaretDoubleRightBold,
} from "react-icons/pi";
import cn from "@core/utils/class-names";

const options = [
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 15, label: "15" },
  { value: 20, label: "20" },
  { value: 25, label: "25" },
];

export default function TablePagination<TData extends Record<string, any>>({
  table,
  showSelectedCount = false,
  className,
}: {
  table: ReactTableType<TData>;
  showSelectedCount?: boolean;
  className?: string;
}) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  return (
    <Flex
      gap="6"
      align="center"
      justify="between"
      className={cn(
        "@container border-t border-gray-100 bg-white px-4 py-3",
        className
      )}
    >
      <Flex align="center" className="w-auto shrink-0">
        <Text className="hidden text-xs font-normal text-gray-500 @md:block">
          Rows per page
        </Text>
        <Select
          size="sm"
          variant="flat"
          options={options}
          className="w-14"
          value={table.getState().pagination.pageSize}
          onChange={(v: SelectOption) => {
            table.setPageSize(Number(v.value));
          }}
          suffixClassName="[&>svg]:size-3 text-gray-500"
          selectClassName="h-7 bg-gray-100 text-xs font-medium text-gray-700 shadow-none ring-0"
          optionClassName="px-2 text-xs font-medium justify-center"
        />
      </Flex>
      {showSelectedCount && (
        <Text className="hidden w-full text-xs font-normal text-gray-500 @2xl:block">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </Text>
      )}
      <Flex justify="end" align="center">
        <Text className="hidden text-xs font-normal text-gray-500 @3xl:block">
          Page {pageIndex + 1} of {pageCount.toLocaleString()}
        </Text>
        <div className="grid grid-cols-4 gap-2">
          <ActionIcon
            size="sm"
            rounded="md"
            variant="outline"
            aria-label="Go to first page"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            className="border-transparent bg-gray-100 text-gray-500 shadow-none hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-300"
          >
            <PiCaretDoubleLeftBold className="size-3.5" />
          </ActionIcon>
          <ActionIcon
            size="sm"
            rounded="md"
            variant="outline"
            aria-label="Go to previous page"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="border-transparent bg-gray-100 text-gray-500 shadow-none hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-300"
          >
            <PiCaretLeftBold className="size-3.5" />
          </ActionIcon>
          <ActionIcon
            size="sm"
            rounded="md"
            variant="outline"
            aria-label="Go to next page"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="border-transparent bg-gray-100 text-gray-500 shadow-none hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-300"
          >
            <PiCaretRightBold className="size-3.5" />
          </ActionIcon>
          <ActionIcon
            size="sm"
            rounded="md"
            variant="outline"
            aria-label="Go to last page"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            className="border-transparent bg-gray-100 text-gray-500 shadow-none hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-300"
          >
            <PiCaretDoubleRightBold className="size-3.5" />
          </ActionIcon>
        </div>
      </Flex>
    </Flex>
  );
}
