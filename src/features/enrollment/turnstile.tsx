"use client";

import * as React from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

/** Cloudflare Turnstile: solo se muestra cuando el servidor lo exige (CHALLENGE_REQUIRED). */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let widgetId: string | null = null;
    const render = () => {
      if (ref.current && window.turnstile && !widgetId) {
        widgetId = window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken, language: "es" });
      }
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken]);
  return <div ref={ref} className="mt-3 flex justify-center" />;
}
