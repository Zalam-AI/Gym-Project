import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import { LanguageProvider } from "@/lib/i18n";
import { RestTimerSettingsProvider } from "@/lib/rest-timer";
import { THEME_BOOTSTRAP_SCRIPT, ThemeProvider } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "GymOS Mobile",
  description: "Your digital gym pass, coaching schedule, and workouts.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GymOS",
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121417",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <PwaRegister />
        <ThemeProvider>
          <RestTimerSettingsProvider>
            <LanguageProvider>{children}</LanguageProvider>
          </RestTimerSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
