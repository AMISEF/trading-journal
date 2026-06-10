"use client";

/**
 * Drag & drop (or click) image upload box.
 * Uploads via POST /uploads and previews the returned URL.
 * Click the image to open a fullscreen viewer.
 */
import { useRef, useState } from "react";
import { API_BASE, uploadsApi } from "@/lib/api";

/** Resolve a possibly-relative upload URL against the API origin. */
function resolveUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http")) return url;
  const origin = API_BASE.replace(/\/api\/?$/, "");
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function ImageDrop({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadsApi.upload(file);
      onChange(url);
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  return (
    <div>
      <div className="tj-label">{label}</div>
      <div
        onClick={() => {
          if (value) { setLightbox(true); return; }
          if (!disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`grid min-h-[160px] cursor-pointer place-items-center rounded-xl border-2 border-dashed p-4 text-center ${
          over ? "border-primary bg-primary-soft" : "border-border bg-surface-2"
        }`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveUrl(value)}
            alt={label}
            className="max-h-48 rounded-lg object-contain"
          />
        ) : uploading ? (
          <span className="text-sm text-muted">در حال آپلود…</span>
        ) : (
          <div className="text-sm text-muted">
            تصویر را اینجا رها کنید یا کلیک کنید
          </div>
        )}
      </div>
      {value && !disabled && (
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="text-xs text-primary"
          >
            مشاهده تمام‌صفحه
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-loss"
          >
            حذف تصویر
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {/* Fullscreen lightbox */}
      {lightbox && value && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveUrl(value)}
            alt={label}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
