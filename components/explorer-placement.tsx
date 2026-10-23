"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * One React parent for the explorer. Placement only moves the mount node,
 * so a Settings change does not remount the tree or an in-flight upload.
 */
export function ExplorerPlacement({
  onRight,
  host,
  children,
}: {
  onRight: boolean;
  host: HTMLElement | null;
  children: ReactNode;
}) {
  const homeRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const mount = document.createElement("div");
    mount.className = "sidebar-files-mount";
    mount.style.display = "contents";
    mountRef.current = mount;
    setReady(true);
    return () => {
      mount.remove();
      mountRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    const home = homeRef.current;
    if (!mount || !home) return;
    const parent = onRight && host ? host : home;
    if (mount.parentElement !== parent) parent.appendChild(mount);
  }, [onRight, host, ready]);

  return (
    <div ref={homeRef} className="sidebar-files-home" hidden={onRight ? true : undefined}>
      {ready && mountRef.current ? createPortal(children, mountRef.current) : children}
    </div>
  );
}
