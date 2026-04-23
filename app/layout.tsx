import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AppProvider } from "@/store/AppContext";

export const metadata: Metadata = {
  title: "CFH 术语合并系统",
  description: "原子级制造术语标准草案智能合并系统（静态前端 + 可选云端 Gemini 代理）"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
