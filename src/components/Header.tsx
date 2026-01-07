export function Header() {
  return (
    <header className="border-b border-surface-border bg-surface-elevated/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-muted flex items-center justify-center">
              <span className="text-surface font-bold text-sm">A</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Arbiter</h1>
          </div>
          <nav className="flex items-center gap-6">
            <a href="#" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Markets
            </a>
            <a href="#" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Arbitrage
            </a>
            <a href="#" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Alerts
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}

