"use client";

import type { ButtonHTMLAttributes } from "react";
import { AnchorSpinnerIcon } from "@/components/icons";

type Variant = "primary" | "secondary" | "brass" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  brass: "btn-brass",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

export function Button({ variant = "primary", loading = false, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn ${variantClass[variant]} ${className ?? ""}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <AnchorSpinnerIcon className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
