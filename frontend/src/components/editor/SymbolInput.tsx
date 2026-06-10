"use client";

/**
 * Symbol input with:
 *  - autocomplete from GET /market/symbols?q=
 *  - a live price line (polls GET /market/price every 5s) with a blinking
 *    green "live" dot.
 * Reports the chosen symbol and its tickSize upward.
 */
import { useEffect, useRef, useState } from "react";
import { marketApi } from "@/lib/api";
import { useDebounced, useInterval } from "@/lib/hooks";
import type { MarketSymbol } from "@/lib/types";
import { faNum } from "@/lib/format";

export function SymbolInput({
  value,
  onSelect,
  disabled,
}: {
  value: string;
  onSelect: (symbol: string, tickSize: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<MarketSymbol[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(text, 350);

  useEffect(() => setText(value), [value]);

  // Fetch autocomplete suggestions when the (debounced) query changes.
  useEffect(() => {
    if (!debounced || debounced.length < 1 || !open) {
      setResults([]);
      return;
    }
    let cancelled = false;
    marketApi
      .symbols(debounced)
      .then((r) => !cancelled && setResults(r.slice(0, 12)))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  // Poll the live price for the selected symbol.
  const fetchPrice = () => {
    if (!value) return;
    marketApi
      .price(value)
      .then((r) => setPrice(r.price))
      .catch(() => {});
  };
  useEffect(fetchPrice, [value]);
  useInterval(fetchPrice, 5000, !!value);

  // Close the dropdown on outside click.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      {/* Live price line */}
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 animate-pulse-dot rounded-full bg-profit" />
        <span className="text-muted">قیمت لحظه‌ای:</span>
        <span className="font-bold text-profit" dir="ltr">
          {price !== null ? faNum(price.toLocaleString("en-US")) : "—"}
        </span>
      </div>

      <input
        className="tj-input"
        dir="ltr"
        disabled={disabled}
        value={text}
        placeholder="مثلاً BTC"
        onChange={(e) => {
          setText(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {results.map((s) => (
            <li
              key={s.symbol}
              onClick={() => {
                onSelect(s.symbol, s.tickSize);
                setText(s.symbol);
                setOpen(false);
              }}
              className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-surface-2"
              dir="ltr"
            >
              <span className="font-medium">{s.symbol}</span>
              <span className="text-xs text-muted">tick {s.tickSize}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
