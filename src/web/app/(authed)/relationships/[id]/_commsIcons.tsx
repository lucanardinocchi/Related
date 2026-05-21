import type { CommsPlatform } from "@related/shared";
import { useId } from "react";

const ICON_CLASS = "h-5 w-5 shrink-0";

export function CommsPlatformIcon({
  platform,
}: {
  platform: CommsPlatform;
}) {
  const gradId = useId();

  switch (platform) {
    case "imessage":
      return (
        <svg
          viewBox="0 0 20 20"
          className={ICON_CLASS}
          aria-label="iMessage"
          role="img"
        >
          <rect width="20" height="20" rx="5" fill="#34C759" />
          <path
            d="M5 6.5c0-.55.45-1 1-1h8c.55 0 1 .45 1 1v5.5c0 .55-.45 1-1 1H9.5L6 15V13H6c-.55 0-1-.45-1-1V6.5z"
            fill="white"
          />
        </svg>
      );
    case "email":
      return (
        <svg
          viewBox="0 0 20 20"
          className={ICON_CLASS}
          aria-label="Email"
          role="img"
        >
          <rect width="20" height="20" rx="5" fill="#EA4335" />
          <path
            d="M4 7.5l6 4 6-4v6.5c0 .55-.45 1-1 1H5c-.55 0-1-.45-1-1V7.5z"
            fill="white"
          />
          <path d="M4 7l6 3.8L16 7" stroke="white" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "instagram":
      return (
        <svg
          viewBox="0 0 20 20"
          className={ICON_CLASS}
          aria-label="Instagram"
          role="img"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FD5949" />
              <stop offset="50%" stopColor="#D6249F" />
              <stop offset="100%" stopColor="#285AEB" />
            </linearGradient>
          </defs>
          <rect width="20" height="20" rx="5" fill={`url(#${gradId})`} />
          <rect
            x="5.5"
            y="5.5"
            width="9"
            height="9"
            rx="2.5"
            stroke="white"
            strokeWidth="1.4"
            fill="none"
          />
          <circle cx="14" cy="6" r="1" fill="white" />
        </svg>
      );
    case "x":
      return (
        <svg
          viewBox="0 0 20 20"
          className={ICON_CLASS}
          aria-label="X"
          role="img"
        >
          <rect width="20" height="20" rx="5" fill="#000" />
          <path
            d="M5.5 5.5l4.2 5.6-4.3 5.4h1.8l3.4-4.3 2.8 4.3H15l-4.5-6 3.9-5H12l-3.1 4-2.5-4H5.5z"
            fill="white"
          />
        </svg>
      );
    case "whatsapp":
      return (
        <svg
          viewBox="0 0 20 20"
          className={ICON_CLASS}
          aria-label="WhatsApp"
          role="img"
        >
          <rect width="20" height="20" rx="5" fill="#25D366" />
          <path
            d="M10 5.5a4.5 4.5 0 00-3.9 6.7L5 15l2.9-.9A4.5 4.5 0 1010 5.5zm0 8.1a3.6 3.6 0 01-1.8-.5l-.3-.2-1.7.5.5-1.7-.2-.3a3.6 3.6 0 115.5 2.2z"
            fill="white"
          />
        </svg>
      );
    case "tiktok":
      return (
        <svg
          viewBox="0 0 20 20"
          className={ICON_CLASS}
          aria-label="TikTok"
          role="img"
        >
          <rect width="20" height="20" rx="5" fill="#010101" />
          <path
            d="M12.2 6.3c.6.5 1.3.8 2.1.8V8.8c-.7 0-1.4-.2-2-.6v4.4a3.1 3.1 0 11-2.2-3c.3.1.7.2 1 .2v-1.4c-.3 0-.7-.1-1-.2a4.5 4.5 0 104.5 4.5V7.4c.9.6 1.9.9 3 .9V6.9c-.8 0-1.5-.2-2.1-.6z"
            fill="#25F4EE"
          />
          <path
            d="M11.7 6.7c-.6-.4-1.3-.6-2-.6V8.5c.7 0 1.4.2 2 .6v4.4a3.1 3.1 0 01-5.2 2.3 4.5 4.5 0 003.2-7.5c-.3-.1-.7-.2-1-.2V6.4c.3 0 .7.1 1 .2.9.6 1.9.9 3 .9V6.4c-.8 0-1.5-.2-2.1-.6z"
            fill="#FE2C55"
          />
        </svg>
      );
  }
}
