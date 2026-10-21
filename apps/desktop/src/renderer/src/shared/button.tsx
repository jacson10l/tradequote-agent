import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./utils";

// Local shadcn-style Radix primitive, adapted to DESIGN.md tokens.
const variants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:bg-disabled disabled:text-muted-foreground",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-action-hover",
        outline: "border border-input bg-card text-foreground hover:bg-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Button({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(variants({ variant }), className)} {...props} />;
}
