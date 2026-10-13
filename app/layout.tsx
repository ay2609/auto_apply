import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "auto-apply",
  description: "Embedded / robotics internship inbox + apply assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
