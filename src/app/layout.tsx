import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AetherFlow | AI Agent Workflow Builder",
  description: "A premium, full-stack visual workflow editor for chaining AI agent steps with robust role-based access controls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-neutral-950 text-neutral-100`}>
        {children}
      </body>
    </html>
  );
}
