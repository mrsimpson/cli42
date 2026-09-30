import { useEffect, useState } from "react";
import { VERSION_CHANGE_EVENT, currentVersion } from "../web/version.ts";

/** The selected version (`?version=`), following links, openVersion and the back button. */
export function useVersion(): string | null {
  const [version, setVersion] = useState(currentVersion);
  useEffect(() => {
    const update = () => setVersion(currentVersion());
    window.addEventListener("popstate", update);
    window.addEventListener(VERSION_CHANGE_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(VERSION_CHANGE_EVENT, update);
    };
  }, []);
  return version;
}
