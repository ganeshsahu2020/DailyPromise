import * as React from "react";

export default function TwoPane({
  aside,
  children,
  className = "",
}: {
  aside: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={["grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]", className].join(" ")}>
      <aside className="lg:sticky lg:top-20 lg:self-start space-y-4">{aside}</aside>
      <section className="min-w-0 space-y-4">{children}</section>
    </div>
  );
}
