import * as React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  as?: keyof JSX.IntrinsicElements;
};

export default function GlassCard({ as: Tag = "div", className = "", ...rest }: Props) {
  return (
    <Tag
      {...rest}
      className={[
        "glass rounded-2xl border border-white/10 shadow-glass",
        "lux-gradient transition-all duration-300",
        "hover:translate-y-[-2px] hover:shadow-float",
        className,
      ].join(" ")}
    />
  );
}
