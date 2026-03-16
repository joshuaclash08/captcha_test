import { useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import Lenis from '@studio-freight/lenis';
import LockRingsLogo from './LockRingsLogo';

export default function Layout() {
  useEffect(() => {
    const lenis = new Lenis();
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 selection:bg-indigo-500/30 font-sans">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="relative flex h-10 w-10 items-center justify-center">
              <LockRingsLogo size={30} variant="compact" animated={false} />
            </div>
            <span className="text-xl font-bold tracking-tight">NoiseCaptcha</span>
          </Link>
          
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link to="/demo" className="text-neutral-400 transition-colors hover:text-white">
              Demo
            </Link>
            <a 
              href="https://github.com/joshuaclash08"
              target="_blank" 
              rel="noreferrer"
              className="rounded-full bg-white px-4 py-2 text-neutral-950 transition-transform hover:scale-105"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-white/10 py-12 text-center text-sm text-neutral-500">
        <p>© 2026 Noise CAPTCHA Project. Proof of concept.</p>
      </footer>
    </div>
  );
}