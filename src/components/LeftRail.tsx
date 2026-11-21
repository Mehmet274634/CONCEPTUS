import {
  FileCode2,
  PanelLeftClose,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../i18n.tsx';
import type { DebateSession, SessionSummary } from '../types.ts';

interface LeftRailProps {
  sessions: SessionSummary[];
  activeSession: DebateSession | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onCollapse: () => void;
}

function formatRelativeTime(timestamp: number, lang: 'tr' | 'en'): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return lang === 'en' ? 'now' : 'şimdi';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return lang === 'en' ? `${min}m` : `${min}dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === 'en' ? `${hr}h` : `${hr}sa`;
  const day = Math.floor(hr / 24);
  if (day < 30) return lang === 'en' ? `${day}d` : `${day}g`;
  return lang === 'en' ? `${Math.floor(day / 30)}mo` : `${Math.floor(day / 30)}ay`;
}

export function LeftRail({
  sessions,
  activeSession,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onCollapse,
}: LeftRailProps) {
  const { lang, t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(query.trim().toLowerCase())
      )
    : sessions;

  return (
    <aside className="w-[244px] shrink-0 h-screen flex flex-col px-2.5 py-3 select-none border-r border-white/[0.06] bg-[#07080b]/85 backdrop-blur-2xl">
      {/* Top Brand + Controls Row (draggable in Desktop frameless mode) */}
      <div className="desktop-drag flex items-center justify-between px-1.5 pb-3">
        <button
          onClick={onNewSession}
          className="desktop-no-drag flex items-center gap-2 group cursor-pointer"
        >
          <img
            src="/icon.png"
            alt="CONCEPTUS"
            className="w-[22px] h-[22px] rounded-[6px] shrink-0 shadow-[0_2px_10px_-2px_rgba(91,75,255,0.6)]"
          />
          <span className="text-[12px] font-bold tracking-[0.18em] text-[#f7f8f8] group-hover:text-white">
            CONCEPTUS
          </span>
        </button>

        <div className="desktop-no-drag flex items-center gap-0.5">
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery('');
            }}
            title={t('Oturumlarda ara', 'Search sessions')}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              searchOpen
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onCollapse}
            title={t('Sol paneli gizle', 'Hide sidebar')}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition cursor-pointer"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Primary New Session Pill */}
      <button
        onClick={onNewSession}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] text-xs font-medium text-[#f7f8f8] transition cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        <Plus className="w-3.5 h-3.5 text-zinc-300" />
        {t('Yeni Oturum', 'New Session')}
      </button>

      {/* Optional inline search */}
      {searchOpen && (
        <div className="mt-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder={t('Oturum ara...', 'Search sessions...')}
            className="glass-input w-full text-xs rounded-xl px-2.5 py-1.5 text-zinc-200 placeholder:text-zinc-600"
          />
        </div>
      )}

      {/* Sessions Section */}
      <div className="mt-5 flex items-center justify-between px-2 pb-1.5">
        <span className="text-[11px] font-medium text-zinc-500">
          {t('Oturumlar', 'Sessions')}
        </span>
        <button
          onClick={onNewSession}
          title={t('Yeni oturum', 'New session')}
          className="text-zinc-500 hover:text-zinc-200 transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {filtered.length === 0 ? (
          <div className="px-2.5 py-6 text-[11px] text-zinc-600">
            {query.trim()
              ? t('Eşleşen oturum yok.', 'No matching sessions.')
              : t('Henüz oturum yok.', 'No sessions yet.')}
          </div>
        ) : (
          filtered.map((s) => {
            const isActive = s.id === activeSession?.id;
            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`group relative flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition ${
                  isActive
                    ? 'bg-white/[0.09] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium truncate leading-snug">
                    {s.title}
                  </p>
                  {(s.hasSynthesis || s.blueprintFileCount > 0) && (
                    <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                      {s.hasSynthesis && (
                        <span className="inline-flex items-center gap-0.5 text-[#3fd0c9]/90">
                          <Sparkles className="w-2.5 h-2.5" />
                          Master
                        </span>
                      )}
                      {s.blueprintFileCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[#958fff]/90">
                          <FileCode2 className="w-2.5 h-2.5" />
                          {s.blueprintFileCount} MD
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <span className="text-[10px] font-mono text-zinc-600 group-hover:hidden shrink-0">
                  {formatRelativeTime(s.updatedAt, lang)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(s.id);
                  }}
                  title={t('Oturumu sil', 'Delete session')}
                  className="hidden group-hover:flex p-1 rounded-md hover:bg-red-500/20 text-zinc-500 hover:text-[#ff7a6e] shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
