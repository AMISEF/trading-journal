"use client";

/**
 * جدا شده از wallet/page.tsx تا با next/dynamic (ssr:false) بارگذاری شود --
 * recharts حجم قابل‌توجهی به باندلِ آن صفحه اضافه می‌کرد که برای رندرِ فوریِ
 * خلاصه/جدولِ تراکنش‌ها لازم نیست.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function WalletBalanceChart({ data }: { data: { date: string; balance: number }[] }) {
  return (
    <div className="tj-card p-5">
      <h3 className="mb-4 text-sm font-bold">تاریخچه موجودی</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} />
          <YAxis stroke="var(--muted)" fontSize={11} width={60} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12 }}
            formatter={(v: number) => [`$${v.toFixed(0)}`, "موجودی"]}
          />
          <Area type="monotone" dataKey="balance" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
