import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LobstarIntern",
  description: "The unpaid intern to @LobstarWilde. Loyal. Devoted. Occasionally brilliant.",
};

// Blocking script to apply saved theme before paint (avoids flash)
const themeScript = `(function(){try{if(localStorage.getItem("theme")==="light"){document.documentElement.classList.add("light")}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-black text-zinc-300 font-mono">
        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
