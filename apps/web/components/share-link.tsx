"use client";

import { useState } from "react";

export function ShareLink({ href, label = "Link to this view" }: { href: string; label?: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="observation-actions">
      <a href={href}>{label}</a>
      <button type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(href, window.location.href).href);
          setMessage("Link copied.");
        } catch {
          setMessage("Open the link to copy its address.");
        }
      }}>Copy link</button>
      <span role="status">{message}</span>
    </div>
  );
}
