import { useEffect, useState } from 'react';

export function useResponsiveLayout(desktopBreakpoint = 980) {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    width,
    isDesktop: width >= desktopBreakpoint
  };
}
