import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LobstarIntern",
  description: "The unpaid intern to @LobstarWilde. Loyal. Devoted. Occasionally brilliant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-black text-zinc-300 font-mono">
        {children}
      </body>
    </html>
  );
}
