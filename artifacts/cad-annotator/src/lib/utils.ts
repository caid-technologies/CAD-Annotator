/**
 * Utility Functions
 *
 * Shared helpers used across the frontend application.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS class names with conflict resolution.
 *
 * Combines `clsx` (conditional class joining) with `tailwind-merge`
 * (deduplicates and resolves conflicting Tailwind utilities).
 *
 * @example
 *   cn("px-4 py-2", isActive && "bg-primary", "px-6")
 *   // → "py-2 bg-primary px-6" (px-4 is overridden by px-6)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
