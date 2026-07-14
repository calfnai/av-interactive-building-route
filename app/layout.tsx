import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "楼栋路径复刻器 · AV Interactive",
  description: "可交互的居民楼栋空间结构、阻隔条件与完整人物移动轨迹模型。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
