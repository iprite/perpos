'use client';

import { Badge } from 'rizzui';
import cn from '../utils/class-names';

const classes = {
  base: 'text-xs px-2 duration-200 py-0.5 font-normal capitalize border tracking-wider font-lexend bg-opacity-50 dark:bg-opacity-40 dark:text-opacity-90 dark:text-gray-900 dark:backdrop-blur',
  color: {
    success: 'border-green bg-green-lighter text-green-dark dark:bg-green',
    danger: 'border-red bg-red-lighter text-red-dark dark:bg-red',
  },
  layout: {
    helium: {
      base: 'bg-opacity-40 text-opacity-90 text-gray-0 dark:text-gray-900 backdrop-blur group-hover:bg-opacity-100 group-hover:text-opacity-100',
      success: 'bg-green',
      danger: 'bg-red',
    },
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const colorStatus = status?.toLowerCase() === 'new' ? 'danger' : 'success';
  const layoutKey = (
    typeof document !== 'undefined'
      ? (document.documentElement.getAttribute('data-layout') ?? undefined)
      : undefined
  ) as keyof typeof classes.layout | undefined;
  const layoutClasses = layoutKey ? classes.layout[layoutKey] : undefined;

  return (
    <Badge
      variant="flat"
      size="sm"
      color={colorStatus}
      className={cn(
        classes.base,
        classes.color[colorStatus],
        layoutClasses?.base,
        layoutClasses?.[colorStatus]
      )}
    >
      {status}
    </Badge>
  );
}
