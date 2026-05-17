# Home prototype

Throwaway. Lives here until the real Expo app exists, then gets folded into a proper screen and deleted.

## What this answers

The Home screen layout, the visual register, the voice-button placement, and the digest structure (Open Threads + upcoming Events + a 30-day "Threads closed" graph at the top).

## Final design

**Card sections** layout (originally drafted as Variant B, with two losing variants — list view and voice-first dark — explored and discarded). Top-to-bottom:

1. Header — *Tuesday · 7:32 pm / Good to see you*
2. **Threads closed** card — big number, orange trend delta, 30-bar daily sparkline
3. **Open Threads** — horizontal card carousel, older first
4. **Talk to Claude** — full-orange CTA tile, voice-on icon
5. **Upcoming** — vertical event cards with black/orange date chips
6. Bottom nav — Home / Calendar / Groups / You

## How to run

Single static HTML file with Tailwind via CDN. Either:

- Open the file directly in a browser (works fine with `file://` URLs), or
- From this directory: `python3 -m http.server 8080` then visit `http://localhost:8080/`.

## Visual style — locked

**Strava-inspired.** Globally applicable to all Related surfaces (not just Home).

- **Primary accent:** Strava orange `#FC4C02` (sparkline bars, avatar circles, the "Talk to Claude" CTA, group labels, and event times in date chips).
- **Background:** clean white. No gradients.
- **Type system:** heavy weights (`font-black` for stats and big CTAs), uppercase tracked labels (`UPPERCASE WITH LETTER-SPACING`) for all section headers and small meta. Strong hierarchy via weight, not colour.
- **Primary text:** black `#000`; secondary text: gray-500; tertiary/labels: gray-400.
- **Date chips:** solid black background, time/date in orange.
- **Bottom nav:** white background, uppercase bold labels, black for the active tab.

### Typeface — locked

**Maison Neue** (Lineto, licensed). The prototype's font stack:

```
'Maison Neue', 'Inter Tight', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif
```

- **Maison Neue** is a paid font from [Lineto](https://lineto.com). It is **not** available on Google Fonts and has no free version. A web licence will need to be purchased before the real app ships.
- Until then, the prototype renders in **Inter Tight** (Google Fonts, free, geometric, close character) so the visual register is approximately right.
- Once Maison Neue is licensed, drop the Lineto webfont CSS into the head; the rest of the stack already names it correctly so it'll take effect automatically.

## Open follow-ups (not blockers)

- "+4 vs prior 30 days" trend delta on the graph is mock data — once real data exists, compute properly (or remove if not load-bearing).
- The graph being interactive (tap to drill into closed Threads of the last 30 days) is undecided — currently visual only.
