import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Opsly",
  description: "Incident response and on-call platform for ROWS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
