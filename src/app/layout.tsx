import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeamSpace",
  description:
    "Notion-style project management for small teams — connected to Gmail, Google Drive, Slack, and Claude.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
