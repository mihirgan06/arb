import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arbiter | Prediction Market Analytics",
  description: "Advanced arbitrage and sentiment analysis for prediction markets",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-background text-foreground selection:bg-primary/20">
        <div className="min-h-screen w-full">
          {children}
        </div>
      </body>
    </html>
  );
}
