import type { PropsWithChildren, HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const baseClass =
  'rounded-3xl border border-border/80 bg-card/95 text-slate-100 shadow-subtle';

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(baseClass, className)} {...props} />
);

export const CardHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
);

export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-slate-400', className)} {...props} />
);

export const CardContent = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6 pt-0', className)} {...props} />
);

export const CardFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center p-6 pt-0', className)} {...props} />
);

export type { PropsWithChildren };
