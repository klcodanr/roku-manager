import type { ComponentChildren } from "preact";

export function Link({
  href,
  children,
  className = "rounded-lg bg-blue-700 px-3.5 py-2.5 font-bold text-white hover:bg-blue-800",
}: {
  href: string;
  children: ComponentChildren;
  className?: string;
}) {
  return (
    <a className={className} href={`#${href}`}>
      {children}
    </a>
  );
}
