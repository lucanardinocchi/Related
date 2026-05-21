"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  contactLocationFromPlace,
  placeFromContactLocation,
  type ContactLocation,
} from "@related/shared";
import { cn } from "@/lib/cn";
import type { PlaceSuggestion } from "@/lib/places/nominatim";

export type ContactLocationValue = ContactLocation;

interface Props {
  value: ContactLocationValue;
  onChange: (next: ContactLocationValue) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const response = await fetch(
    `/api/places/search?q=${encodeURIComponent(query)}`,
  );
  if (!response.ok) return [];
  return (await response.json()) as PlaceSuggestion[];
}

export function contactLocationFromValue(
  value: ContactLocationValue,
): ContactLocationValue {
  return value;
}

export function contactLocationToValue(
  place: PlaceSuggestion | null,
): ContactLocationValue {
  if (!place) {
    return { area: null, latitude: null, longitude: null };
  }
  return contactLocationFromPlace({
    label: place.label,
    latitude: place.latitude,
    longitude: place.longitude,
  });
}

export function LocationPicker({
  value,
  onChange,
  placeholder = "Search city, suburb, or neighbourhood…",
  autoFocus = false,
  className,
}: Props) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = placeFromContactLocation(value);
  const [query, setQuery] = useState(selected?.label ?? value.area ?? "");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(selected?.label ?? value.area ?? "");
  }, [selected, value.area]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [results, open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchPlaces(trimmed)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, open]);

  function pick(place: PlaceSuggestion) {
    onChange(contactLocationToValue(place));
    setQuery(place.label);
    setOpen(false);
  }

  function clear() {
    onChange({ area: null, latitude: null, longitude: null });
    setQuery("");
    setOpen(false);
  }

  function handleBlur() {
    window.setTimeout(() => {
      setOpen(false);
      if (selected) {
        setQuery(selected.label);
        return;
      }
      if (query.trim() === "") {
        clear();
        return;
      }
      setQuery(value.area ?? "");
    }, 120);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (results.length > 0) {
        setHighlightIndex((current) => (current + 1) % results.length);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length > 0) {
        setHighlightIndex(
          (current) => (current - 1 + results.length) % results.length,
        );
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const match = results[highlightIndex];
      if (match) pick(match);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery(selected?.label ?? value.area ?? "");
    }
  }

  const showEmptyState =
    open && query.trim().length >= 2 && !loading && results.length === 0;

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-8 w-full rounded-md border border-border bg-bg px-2.5 text-[14px] leading-[22px] text-fg placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-accent focus-visible:outline-none"
      />
      {open && loading && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-divider bg-bg px-2.5 py-2 text-[13px] text-fg-subtle shadow-lg">
          Searching…
        </div>
      )}
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-divider bg-bg py-1 shadow-lg"
        >
          {results.map((place, index) => (
            <li key={place.id} role="option">
              <button
                type="button"
                className={cn(
                  "flex w-full px-2.5 py-1.5 text-left text-[14px]",
                  index === highlightIndex
                    ? "bg-hover text-fg"
                    : "text-fg hover:bg-hover",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {showEmptyState && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-divider bg-bg px-2.5 py-2 text-[13px] text-fg-subtle shadow-lg">
          No matching places.
        </div>
      )}
    </div>
  );
}

/** @deprecated Use LocationPicker */
export const SuburbPicker = LocationPicker;
