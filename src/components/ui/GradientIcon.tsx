import * as React from "react";
import type { LucideIcon } from "lucide-react";

type Props = React.SVGProps<SVGSVGElement> & {
  icon: LucideIcon;
};

export default function GradientIcon({ icon: Icon, className = "", ...rest }: Props) {
  return (
    <span className="inline-flex items-center justify-center relative group">
      <Icon
        {...rest}
        className={[
          "w-5 h-5 transition-transform duration-300",
          "group-hover:scale-110 group-focus:scale-110",
          className,
        ].join(" ")}
        aria-hidden={rest["aria-label"] ? undefined : true}
      />
      {/* Gradient fills via mask: works broadly without defs id collisions */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity"
        style={{
          WebkitMaskImage: "url('data:image/svg+xml;utf8," + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>`
          ) + "')",
        }}
      />
    </span>
  );
}
