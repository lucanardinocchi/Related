import type { CommsPlatform } from "@related/shared";

const ICON_CLASS = "h-4 w-4";

/** Monochrome platform marks for the comms spine. */
export function CommsPlatformIcon({
  platform,
}: {
  platform: CommsPlatform;
}) {
  switch (platform) {
    case "imessage":
      return (
        <svg
          viewBox="0 0 16 16"
          className={ICON_CLASS}
          aria-label="iMessage"
          role="img"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 4.5h9a1 1 0 011 1v4.5a1 1 0 01-1 1H7.5L5 12.5V10H3.5a1 1 0 01-1-1V5.5a1 1 0 011-1z" />
        </svg>
      );
    case "email":
      return (
        <svg
          viewBox="0 0 16 16"
          className={ICON_CLASS}
          aria-label="Email"
          role="img"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2.5" y="4.5" width="11" height="8" rx="1" />
          <path d="M2.5 5.5l5.5 3.5L13.5 5.5" />
        </svg>
      );
    case "instagram":
      return (
        <svg
          viewBox="0 0 16 16"
          className={ICON_CLASS}
          aria-label="Instagram"
          role="img"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="3.5" width="9" height="9" rx="2.5" />
          <circle cx="8" cy="8" r="2.1" />
          <circle cx="11.2" cy="4.8" r="0.55" fill="currentColor" stroke="none" />
        </svg>
      );
    case "x":
      return (
        <svg
          viewBox="0 0 16 16"
          className={ICON_CLASS}
          aria-label="X"
          role="img"
          fill="currentColor"
          stroke="none"
        >
          <path d="M4.2 4.2l2.9 3.9-3.1 3.9h1.4l2.4-3 2 3h1.4l-3.2-4.1 2.8-3.7H9.4L7.2 7.4 5.5 4.2H4.2zm1 .9h.8l5.8 7.8h-.8L5.2 5.1z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg
          viewBox="0 0 16 16"
          className={ICON_CLASS}
          aria-label="WhatsApp"
          role="img"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3a5 5 0 00-4.3 7.5L3 13l2.6-.7A5 5 0 108 3z" />
          <path d="M6.2 6.5c.2-.5.8-.4 1-.1l.3.4c.2.3.5.7.5 1.1 0 .6-.5 1.1-1 1.4-.4.2-.9.1-1.2-.2" />
        </svg>
      );
    case "tiktok":
      return (
        <svg
          viewBox="0 0 16 16"
          className={ICON_CLASS}
          aria-label="TikTok"
          role="img"
          fill="currentColor"
          stroke="none"
        >
          <path d="M9.8 3.5c.3.9.9 1.5 1.8 1.6v1.3c-.6 0-1.2-.2-1.7-.5v3.4a2.6 2.6 0 11-1.8-2.5c.2.1.5.1.7.1V5.6c-.2 0-.5-.1-.7-.2a3.8 3.8 0 103.8 3.8V4.8c.7.5 1.6.8 2.5.8V4.3c-.8 0-1.5-.3-2.1-.8z" />
        </svg>
      );
  }
}
