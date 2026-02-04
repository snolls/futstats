import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import OnboardingModal from "@/components/OnboardingModal"; // Deprecated, can remove if file deleted
import AuthGuard from "@/components/AuthGuard";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FutStats",
  description: "Gestión de estadísticas y partidos de fútbol",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      {/* AÑADE suppressHydrationWarning AQUÍ ABAJO vvv */}


      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <AuthProvider>
          <AuthGuard>
            <NotificationsProvider>
              <Toaster position="top-center" richColors theme="dark" />
              {/* OnboardingModal removed in favor of dedicated page */}
              {children}
            </NotificationsProvider>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
