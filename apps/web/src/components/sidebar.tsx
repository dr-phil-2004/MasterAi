'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Projets', icon: '◆' },
  { href: '/agents', label: 'Agents', icon: '❖' },
  { href: '/settings/models', label: 'Modèles', icon: '⚙' },
  { href: '/settings/integrations', label: 'Intégrations', icon: '⚡' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" /> MasterAI
      </div>
      {NAV.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      <div style={{ marginTop: 'auto' }} className="muted mono">
        v0.1 · Mastra
      </div>
    </aside>
  );
}
