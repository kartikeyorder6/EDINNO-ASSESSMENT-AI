import type { Metadata } from "next";
import "./globals.css";
import { AssessmentProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "EDINNO AI Assessment — STEM & Hardware Robotics Studio",
  description: "Next-Generation Visual & Interactive Assessment Platform for STEM Education",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-[#FDFBF7] text-[#1C1917]" suppressHydrationWarning>
        <AssessmentProvider>
          {children}
        </AssessmentProvider>
      </body>
    </html>
  );
}

