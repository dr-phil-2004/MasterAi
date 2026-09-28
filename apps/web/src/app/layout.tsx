import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';

export const metadata: Metadata = {
  title: 'MasterAI — Orchestration d’agents',
  description: 'Chaîne de développement logiciel automatisée par des agents IA (Mastra).',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="layout">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
