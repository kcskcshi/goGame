import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { Tooltip } from 'recharts';
import type { TooltipProps } from 'recharts';
import { cn } from '../../lib/utils';

export type ChartConfig = Record<
  string,
  {
    label: string;
    color?: string;
  }
>;

type ChartContainerProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    config: ChartConfig;
  }
>;

export const ChartContainer = ({
  className,
  children,
  config,
  style,
  ...props
}: ChartContainerProps) => {
  const cssVars = Object.entries(config).reduce<Record<string, string>>(
    (acc, [key, value], index) => {
      const color = value.color ?? `hsl(${210 + index * 40} 70% 60%)`;
      acc[`--color-${key}`] = color;
      return acc;
    },
    {},
  );

  return (
    <div
      className={cn(
        'relative w-full rounded-3xl border border-border/80 bg-slate-900/60 p-4',
        className,
      )}
      style={{ ...cssVars, ...style }}
      {...props}
    >
      {children}
    </div>
  );
};

type ChartTooltipContentProps = {
  label?: string | number;
  value?: string | number;
  color?: string;
};

export const ChartTooltipContent = ({ label, value, color }: ChartTooltipContentProps) => (
  <div className="rounded-xl border border-border/60 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-subtle">
    <p className="font-semibold" style={{ color }}>
      {value}
    </p>
    {label && <p className="mt-1 text-slate-400">{label}</p>}
  </div>
);

type ChartTooltipProps = TooltipProps<number, string> & {
  content?: (props: TooltipProps<number, string>) => ReactNode;
};

export const ChartTooltip = ({ content, ...props }: ChartTooltipProps) => (
  <Tooltip
    {...props}
    wrapperClassName="outline-none"
    content={(tooltipProps) => {
      if (!tooltipProps.active || !tooltipProps.payload || tooltipProps.payload.length === 0) {
        return null;
      }

      if (content) {
        return content(tooltipProps);
      }

      const item = tooltipProps.payload[0]!;
      return (
        <ChartTooltipContent
          label={tooltipProps.label}
          value={item.value}
          color={item.color}
        />
      );
    }}
  />
);
