import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-[#e9edf1] bg-white shadow-[0_2px_8px_rgba(24,33,47,0.025)] ${className}`}
      {...props}
    />
  );
}
