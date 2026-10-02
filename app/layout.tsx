import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roombook | Selangor Properties",
  description: "Find an available meeting room and keep your team's bookings in sync.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
