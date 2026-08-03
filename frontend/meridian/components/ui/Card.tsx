import type { HTMLAttributes } from "react";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`manifest-card p-6 ${className ?? ""}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`mb-5 flex items-start justify-between gap-4 ${className ?? ""}`} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={`text-lg font-semibold text-foam ${className ?? ""}`} {...rest}>
      {children}
    </h2>
  );
}
