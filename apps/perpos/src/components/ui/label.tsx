import * as React from "react";

import cn from "@core/utils/class-names";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn("text-sm font-medium leading-none text-slate-900", className)}
        {...props}
      />
    );
  },
);

Label.displayName = "Label";

export { Label };

