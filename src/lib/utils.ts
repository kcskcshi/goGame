import { twMerge } from "tailwind-merge";
export const cn = (...inputs: Array<string | undefined | false | null>) => twMerge(...inputs.filter(Boolean));
