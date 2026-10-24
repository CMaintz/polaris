import type { ReactNode } from "react";
import type { Resource } from "../../lib/hooks/resource";
import { ErrorBox, Pending } from "./feedback";

/**
 * Renders a loaded resource, and its error or loading state otherwise. A failed first load
 * shows the error instead of "Loading..." forever; a failed reload keeps the stale data on
 * screen with the error above it.
 */
export function ResourceView<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
}) {
  if (resource.data === null) return <Pending error={resource.error} />;
  return (
    <>
      <ErrorBox error={resource.error} />
      {children(resource.data)}
    </>
  );
}
