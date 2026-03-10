import type { ReactNode } from "react";

type FullPageLoaderProps = {
  label?: string;
  note?: ReactNode;
};

export function FullPageLoader({
  label = "Loading",
  note,
}: FullPageLoaderProps) {
  return (
    <div className="loader-wrap">
      <div className="card w-full max-w-sm text-center">
        <div className="mx-auto loader" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold">{label}</p>
        {note ? <p className="helper mt-1">{note}</p> : null}
      </div>
    </div>
  );
}
