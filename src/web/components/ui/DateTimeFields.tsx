"use client";

import { Input } from "./Input";
import { cn } from "@/lib/cn";

interface DateTimeFieldsProps {
  date: string;
  time: string;
  onDateChange: (next: string) => void;
  onTimeChange: (next: string) => void;
  isAllDay?: boolean;
  dateId?: string;
  timeId?: string;
  className?: string;
}

/**
 * Paired native date and time pickers for forms. Avoids the raw
 * datetime-local text convention (YYYY-MM-DDTHH:mm).
 */
export function DateTimeFields({
  date,
  time,
  onDateChange,
  onTimeChange,
  isAllDay = false,
  dateId,
  timeId,
  className,
}: DateTimeFieldsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Input
        id={dateId}
        type="date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        className="w-auto min-w-[148px]"
      />
      {!isAllDay && (
        <Input
          id={timeId}
          type="time"
          value={time}
          step={900}
          onChange={(e) => onTimeChange(e.target.value)}
          className="w-auto min-w-[112px]"
        />
      )}
    </div>
  );
}

export function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoToTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

export function localDateTimeToIso(date: string, time: string, isAllDay = false): string {
  return dateTimeToIso(date, isAllDay ? "00:00" : time);
}
