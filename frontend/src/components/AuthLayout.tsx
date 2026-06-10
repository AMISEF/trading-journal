"use client";

import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Shared centered card layout for auth pages. */
export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-4">
      <div className="absolute left-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4">
            <Image
              src="/logo-icon.png"
              alt="CryptoSmart"
              width={72}
              height={72}
              className="mx-auto rounded-2xl"
            />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted">پنل ژورنال تریدینگ کریپتو اسمارت</p>
        </div>
        <div className="tj-card p-6">{children}</div>
      </div>
    </div>
  );
}
