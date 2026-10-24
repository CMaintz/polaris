import { useCallback, useEffect, useState } from "react";

/**
 * Resolves colour tokens (a comma-separated list) to concrete colours, for chart libraries that
 * take colours as props. Reading a token directly would return the unresolved light-dark(...)
 * text, so each is applied to a probe element and read back as a computed colour.
 */
export function useCssVars(names: string): Record<string, string> {
  const read = useCallback(() => {
    const probe = document.body.appendChild(document.createElement("span"));
    const resolved = names.split(",").map((name) => {
      probe.style.color = `var(${name})`;
      return [name, getComputedStyle(probe).color];
    });
    probe.remove();
    return Object.fromEntries(resolved);
  }, [names]);
  const [vars, setVars] = useState(read);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setVars(read());
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [read]);
  return vars;
}
