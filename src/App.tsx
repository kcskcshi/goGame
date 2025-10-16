import { useEffect, useState } from 'react';

import GameView from './views/GameView';
import LinkShortener from './views/LinkShortener';
import ReceiptAnalyzer from './views/ReceiptAnalyzer';
import { cn } from './lib/utils';

type ActiveTab = 'game' | 'shortener' | 'receipt';

const App = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === 'undefined') {
      return 'game';
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has('s')) {
      return 'shortener';
    }

    if (params.get('view') === 'receipt') {
      return 'receipt';
    }

    return 'game';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    if (activeTab === 'game') {
      if (params.has('s') || params.get('view')) {
        params.delete('s');
        params.delete('view');
        const query = params.toString();
        window.history.replaceState({}, '', query ? `?${query}` : window.location.pathname);
      }
      return;
    }

    if (activeTab === 'shortener') {
      params.delete('view');
      const query = params.toString();
      window.history.replaceState({}, '', query ? `?${query}` : window.location.pathname);
      return;
    }

    if (activeTab === 'receipt') {
      params.set('view', 'receipt');
      const query = params.toString();
      window.history.replaceState({}, '', `?${query}`);
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-12 sm:py-16">
        <header className="flex flex-col gap-3 text-center sm:gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-300/70">
            꼬맨틀
          </p>
          <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">
            초성 추리 · 링크 단축 · 영수증 인식까지
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-300 sm:text-base">
            초성만 보고 정답을 추리하거나, 공유용 링크를 단축하고, Google Gemini로 영수증에서 핵심 정보를
            뽑아보세요.
          </p>
        </header>

        <nav className="flex justify-center">
          <div className="inline-flex rounded-full border border-border/60 bg-slate-900/60 p-1 text-sm font-semibold text-slate-300 shadow-subtle">
            {(
              [
                { id: 'game', label: '초성 게임' },
                { id: 'shortener', label: '링크 단축기' },
                { id: 'receipt', label: '영수증 인식기' },
              ] as Array<{ id: ActiveTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-full px-5 py-2 transition text-left',
                  activeTab === tab.id ? 'bg-indigo-500 text-white shadow-sm' : 'hover:text-white',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <main className="flex flex-1 flex-col gap-6 sm:gap-8">
          {activeTab === 'game' && <GameView />}
          {activeTab === 'shortener' && <LinkShortener />}
          {activeTab === 'receipt' && <ReceiptAnalyzer />}
        </main>

        <footer className="border-t border-dashed border-border/60 pt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} 꼬맨틀. 초성 추리, 링크 단축, 영수증 인식 도구.
        </footer>
      </div>
    </div>
  );
};

export default App;
