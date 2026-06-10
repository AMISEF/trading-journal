"use client";

/**
 * Jalali (Persian) date + time picker.
 * Edits year/month/day via selects + a time input, and stores an ISO string.
 */
import { useEffect, useState } from "react";
import {
  isoToJalaliParts,
  jalaliDaysInMonth,
  jalaliToISO,
  JALALI_MONTHS,
  toPersianDigits,
} from "@/lib/jalali";

export function JalaliDateTime({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
}) {
  const parts = isoToJalaliParts(value);
  const [jy, setJy] = useState(parts.jy);
  const [jm, setJm] = useState(parts.jm);
  const [jd, setJd] = useState(parts.jd);
  const [time, setTime] = useState(parts.time);

  // Re-seed when an external value arrives (e.g. after load).
  useEffect(() => {
    const p = isoToJalaliParts(value);
    setJy(p.jy);
    setJm(p.jm);
    setJd(p.jd);
    setTime(p.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (y: number, m: number, d: number, t: string) => {
    onChange(jalaliToISO(y, m, d, t));
  };

  const daysInMonth = jalaliDaysInMonth(jy, jm);
  const currentYear = isoToJalaliParts(new Date().toISOString()).jy;
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i);

  return (
    <div>
      <div className="tj-label">{label}</div>
      <div className="grid grid-cols-4 gap-2">
        <select
          className="tj-input"
          disabled={disabled}
          value={jy}
          onChange={(e) => {
            const v = Number(e.target.value);
            setJy(v);
            emit(v, jm, jd, time);
          }}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {toPersianDigits(y)}
            </option>
          ))}
        </select>
        <select
          className="tj-input"
          disabled={disabled}
          value={jm}
          onChange={(e) => {
            const v = Number(e.target.value);
            setJm(v);
            const maxD = jalaliDaysInMonth(jy, v);
            const nd = Math.min(jd, maxD);
            setJd(nd);
            emit(jy, v, nd, time);
          }}
        >
          {JALALI_MONTHS.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="tj-input"
          disabled={disabled}
          value={jd}
          onChange={(e) => {
            const v = Number(e.target.value);
            setJd(v);
            emit(jy, jm, v, time);
          }}
        >
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {toPersianDigits(d)}
            </option>
          ))}
        </select>
        <input
          type="time"
          dir="ltr"
          className="tj-input"
          disabled={disabled}
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            emit(jy, jm, jd, e.target.value);
          }}
        />
      </div>
    </div>
  );
}
