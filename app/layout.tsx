import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // <--- É aqui que ele puxa aquele CSS que renomeamos

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Franca Office",
  description: "Escritório Virtual",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}