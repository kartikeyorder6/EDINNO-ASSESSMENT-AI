import type { Metadata } from "next";
import "./globals.css";
import Header from "../components/Header";
import { AssessmentProvider } from "../lib/store";

export const metadata: Metadata = {
  title: "EDINNO AI Assessment Engine",
  description: "Next-Generation STEM & Hardware Curriculum Assessment Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.clear();sessionStorage.clear();}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased min-h-screen flex flex-col bg-[#FAF8F5]" suppressHydrationWarning>
        <AssessmentProvider>
          <Header />
          <main className="flex-1 pb-16">{children}</main>
        </AssessmentProvider>
      </body>
    </html>
  );
}
