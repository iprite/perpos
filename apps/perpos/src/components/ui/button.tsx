import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import cn from "@core/utils/class-names";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white",
          variant === "default" && "bg-blue-600 text-white hover:bg-blue-700",
          variant === "secondary" && "bg-slate-100 text-slate-900 hover:bg-slate-200",
          variant === "outline" && "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
          variant === "ghost" && "text-slate-900 hover:bg-slate-100",
          variant === "destructive" && "bg-red-600 text-white hover:bg-red-700",
          size === "default" && "h-9 px-4 py-2",
          size === "sm" && "h-8 rounded-md px-3",
          size === "lg" && "h-10 rounded-md px-6",
          size === "icon" && "h-9 w-9",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button };

