import * as React from "react";

import cn from "@core/utils/class-names";

/**
 * Standard DataTable primitives — PERPOS design system.
 *
 * กฎ:
 * - ตารางต้องแสดงเต็ม + เลื่อนซ้าย-ขวาได้ (cell default `whitespace-nowrap` → ตาราง
 *   overflow แล้ว wrapper scroll แทนการบีบคอลัมน์ / wrap text)
 * - คอลัมน์เงิน/จำนวน → `<TableCell align="right" tabular>`
 * - แถวที่คลิกได้ → `<TableRow clickable onClick={…}>` (เปิด detail/edit dialog)
 * - ปุ่ม action ในแถวให้ย้ายไปไว้ใน detail dialog แทน
 */

type TableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  /** ทำให้ thead ค้างด้านบนเมื่อ scroll แนวตั้ง (ต้องคู่กับ maxHeight) */
  stickyHeader?: boolean;
  /** จำกัดความสูง wrapper เพื่อให้ scroll แนวตั้ง เช่น "70vh" หรือ "480px" */
  maxHeight?: string;
  /** className ของ wrapper ด้านนอก (ตัว scroll container) */
  wrapperClassName?: string;
};

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, stickyHeader, maxHeight, wrapperClassName, ...props }, ref) => (
    <div
      className={cn(
        "w-full overflow-auto rounded-xl border border-gray-200 bg-white",
        wrapperClassName,
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table
        ref={ref}
        data-sticky-header={stickyHeader ? "" : undefined}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

type TableHeaderProps = React.HTMLAttributes<HTMLTableSectionElement> & {
  /** sticky top เมื่ออยู่ใน Table ที่กำหนด maxHeight */
  sticky?: boolean;
};

const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, sticky, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        "border-b border-gray-200 bg-gray-50",
        sticky && "sticky top-0 z-10",
        className,
      )}
      {...props}
    />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("divide-y divide-gray-100 [&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn("border-t-2 border-gray-200 bg-gray-50 font-semibold", className)}
      {...props}
    />
  ),
);
TableFooter.displayName = "TableFooter";

type TableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  /** ทำให้ทั้งแถวคลิกได้ (cursor + hover เข้ม + a11y keyboard) — ใช้คู่ onClick */
  clickable?: boolean;
  /** ไฮไลต์แถวที่ถูกเลือก/active */
  selected?: boolean;
};

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, clickable, selected, onClick, onKeyDown, ...props }, ref) => (
    <tr
      ref={ref}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          (e.currentTarget as HTMLTableRowElement).click();
        }
        onKeyDown?.(e);
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        "border-b border-gray-100 transition-colors",
        clickable
          ? "cursor-pointer hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none"
          : "hover:bg-gray-50",
        selected && "bg-indigo-50/60",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

type AlignedCellProps = {
  align?: "left" | "right" | "center";
};

const alignClass = (align?: "left" | "right" | "center") =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & AlignedCellProps
>(({ className, align, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 whitespace-nowrap px-3 align-middle text-xs font-semibold uppercase tracking-wide text-gray-500",
      alignClass(align),
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> &
  AlignedCellProps & {
    /** ยอมให้ข้อความ wrap (escape hatch สำหรับ cell ข้อความยาว เช่น JSON/note) */
    wrap?: boolean;
    /** คอลัมน์ตัวเลขเงิน → font-mono tabular-nums */
    tabular?: boolean;
  };

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, align, wrap, tabular, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "px-3 py-3 align-middle text-sm text-gray-900",
        wrap ? "whitespace-normal" : "whitespace-nowrap",
        tabular && "font-mono tabular-nums",
        alignClass(align),
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

/** แถว empty/loading เต็มความกว้าง — ใช้ภายใน <TableBody> */
function TableEmpty({
  colSpan,
  children = "ไม่มีข้อมูล",
  className,
}: {
  colSpan: number;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn("px-4 py-12 text-center text-sm text-gray-400", className)}>
        {children}
      </td>
    </tr>
  );
}

function TableLoading({ colSpan, rows = 5 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td colSpan={colSpan} className="px-3 py-3">
            <div className="h-5 w-full animate-pulse rounded bg-gray-100" />
          </td>
        </tr>
      ))}
    </>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
};
