import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function languageColor(language?: string): string {
  switch (language) {
    case "TypeScript":
      return "bg-blue-500";
    case "JavaScript":
      return "bg-yellow-500";
    case "Python":
      return "bg-green-500";
    case "Rust":
      return "bg-orange-500";
    case "Go":
      return "bg-cyan-500";
    case "Ruby":
      return "bg-red-500";
    case "Java":
      return "bg-amber-700";
    default:
      return "bg-muted-foreground";
  }
}
