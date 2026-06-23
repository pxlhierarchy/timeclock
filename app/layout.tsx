import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Time Clock",
  description: "Employee punch in / punch out",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
