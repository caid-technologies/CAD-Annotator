/**
 * Mobile Breakpoint Hook
 *
 * Detects whether the viewport is below the mobile breakpoint (768px)
 * using a media query listener. Updates reactively on window resize.
 */
import * as React from "react";

/** Breakpoint width in pixels — matches Tailwind's `md` breakpoint. */
const MOBILE_BREAKPOINT = 768;

/**
 * Returns `true` when the viewport width is below the mobile breakpoint.
 * Returns `false` on wider screens. Defaults to `false` during SSR/initial render.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
