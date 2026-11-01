"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const WEIGHT_KG_WHEEL_VALUES: number[] = (() => {
  const set = new Set<number>([
    0, 2, 2.5, 4, 5, 6, 7.5, 8, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20,
  ]);
  for (let w = 22.5; w <= 200; w += 2.5) {
    set.add(Math.round(w * 10) / 10);
  }
  for (let w = 205; w <= 300; w += 5) {
    set.add(w);
  }
  return Array.from(set).sort((a, b) => a - b);
})();

export const REPS_WHEEL_VALUES: number[] = Array.from(
  { length: 50 },
  (_, idx) => idx + 1,
);

export const SETS_WHEEL_VALUES: number[] = Array.from(
  { length: 10 },
  (_, idx) => idx + 1,
);

type WheelNumberPickerProps = {
  label: string;
  unit?: string;
  values: number[];
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  minCustom?: number;
  maxCustom?: number;
  stepCustom?: number;
  compact?: boolean;
};

export function WheelNumberPicker({
  label,
  unit,
  values,
  value,
  onChange,
  ariaLabel,
  minCustom = 0,
  maxCustom = 1000,
  stepCustom = 0.5,
  compact = false,
}: WheelNumberPickerProps) {
  const itemHeight = compact ? 36 : 40;
  const visibleRows = compact ? 3 : 5;
  const containerHeight = itemHeight * visibleRows;
  const spacerHeight = ((visibleRows - 1) / 2) * itemHeight;

  const normalizedValue = Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : 0;

  const mergedValues = useMemo(() => {
    const hasExact = values.some((v) => Math.abs(v - normalizedValue) < 0.001);
    if (hasExact) return values;
    return [...values, normalizedValue].sort((a, b) => a - b);
  }, [values, normalizedValue]);

  const selectedIndex = useMemo(() => {
    const exactIdx = mergedValues.findIndex(
      (v) => Math.abs(v - normalizedValue) < 0.001,
    );
    if (exactIdx >= 0) return exactIdx;
    let closestIdx = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    mergedValues.forEach((v, idx) => {
      const diff = Math.abs(v - normalizedValue);
      if (diff < bestDiff) {
        bestDiff = diff;
        closestIdx = idx;
      }
    });
    return closestIdx;
  }, [mergedValues, normalizedValue]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userScrollingRef = useRef(false);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const [isEditingManual, setIsEditingManual] = useState(false);
  const [manualText, setManualText] = useState("");

  const scrollToIndex = useCallback(
    (idx: number, smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      const targetTop = Math.max(0, idx * itemHeight);
      if (Math.abs(el.scrollTop - targetTop) < 1) return;
      programmaticScrollRef.current = true;
      el.scrollTo({
        top: targetTop,
        behavior: smooth ? "smooth" : "auto",
      });
      window.setTimeout(
        () => {
          programmaticScrollRef.current = false;
        },
        smooth ? 220 : 40,
      );
    },
    [itemHeight],
  );

  // Sync wheel scroll position when external value changes (without fighting user's finger)
  useEffect(() => {
    if (userScrollingRef.current || isEditingManual) return;
    scrollToIndex(selectedIndex, false);
  }, [selectedIndex, scrollToIndex, isEditingManual]);

  useEffect(() => {
    return () => {
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
      }
    };
  }, []);

  function handleScroll() {
    if (programmaticScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    userScrollingRef.current = true;

    const rawIndex = Math.round(el.scrollTop / itemHeight);
    const clampedIndex = Math.max(
      0,
      Math.min(mergedValues.length - 1, rawIndex),
    );
    const nextVal = mergedValues[clampedIndex];
    if (nextVal !== undefined && Math.abs(nextVal - normalizedValue) >= 0.001) {
      onChange(nextVal);
    }

    if (scrollSettleTimerRef.current !== null) {
      window.clearTimeout(scrollSettleTimerRef.current);
    }
    scrollSettleTimerRef.current = window.setTimeout(() => {
      userScrollingRef.current = false;
      scrollToIndex(clampedIndex, true);
    }, 110);
  }

  function stepBy(delta: number) {
    const nextIdx = Math.max(
      0,
      Math.min(mergedValues.length - 1, selectedIndex + delta),
    );
    const nextVal = mergedValues[nextIdx];
    if (nextVal !== undefined) {
      onChange(nextVal);
      scrollToIndex(nextIdx, true);
    }
  }

  function commitManualValue() {
    setIsEditingManual(false);
    const parsed = Number.parseFloat(manualText);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(
      minCustom,
      Math.min(maxCustom, Math.round(parsed * 100) / 100),
    );
    onChange(clamped);
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-surface p-2.5">
      <div className="mb-1.5 flex items-center gap-1 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
          {label}
        </span>
        {unit && (
          <span className="text-[10px] font-semibold text-ink-muted">
            ({unit})
          </span>
        )}
      </div>

      {isEditingManual ? (
        <div
          className="flex w-full flex-col items-center justify-center gap-2 px-1"
          style={{ height: `${containerHeight}px` }}
        >
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            min={minCustom}
            max={maxCustom}
            step={stepCustom}
            aria-label={ariaLabel}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            onBlur={commitManualValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitManualValue();
              } else if (e.key === "Escape") {
                setIsEditingManual(false);
              }
            }}
            className="w-full rounded-xl border border-accent bg-subtle py-2 text-center text-[20px] font-bold text-ink focus:outline-none"
          />
          <span className="text-[9px] text-ink-muted">Tap outside to apply</span>
        </div>
      ) : (
        <div
          dir="ltr"
          className="relative w-full select-none overflow-hidden rounded-xl bg-subtle"
          style={{ height: `${containerHeight}px` }}
        >
          {/* Center Selection Highlight Window */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-1.5 rounded-xl border border-accent-border bg-accent-soft"
            style={{
              top: `${spacerHeight}px`,
              height: `${itemHeight}px`,
            }}
          />

          {/* Scroll-Snap Drum */}
          <div
            ref={scrollRef}
            role="listbox"
            tabIndex={0}
            aria-label={ariaLabel}
            onScroll={handleScroll}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                stepBy(-1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                stepBy(1);
              }
            }}
            className="relative z-10 h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain focus:outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div style={{ height: `${spacerHeight}px` }} aria-hidden="true" />
            {mergedValues.map((item, idx) => {
              const distance = Math.abs(idx - selectedIndex);
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    if (isSelected) {
                      setManualText(String(normalizedValue));
                      setIsEditingManual(true);
                    } else {
                      onChange(item);
                      scrollToIndex(idx, true);
                    }
                  }}
                  style={{ height: `${itemHeight}px` }}
                  className={`flex w-full snap-center items-center justify-center transition-all ${
                    isSelected
                      ? "text-[20px] font-bold tracking-tight text-accent-text"
                      : distance === 1
                        ? "text-[14px] font-medium text-ink-secondary opacity-80"
                        : "text-[12px] font-normal text-ink-muted opacity-45"
                  }`}
                >
                  <span data-no-translate="true">
                    {item === 0 && unit === "kg" ? "BW / 0" : item}
                  </span>
                </button>
              );
            })}
            <div style={{ height: `${spacerHeight}px` }} aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
