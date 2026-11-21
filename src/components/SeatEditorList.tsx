import { Plus, Trash2, Zap } from 'lucide-react';
import {
  EFFORT_LABELS,
  PROVIDER_META,
  ROLE_OPTIONS,
  type EffortLevel,
  type ProviderId,
  type ProviderInfo,
  type SeatConfig,
  type SeatRole,
} from '../types.ts';

interface SeatEditorListProps {
  seats: SeatConfig[];
  providers: ProviderInfo[];
  onChange: (seats: SeatConfig[]) => void;
  compact?: boolean;
}

const CUSTOM_MODEL_SENTINEL = '__custom__';

export function SeatEditorList({
  seats,
  providers,
  onChange,
  compact = false,
}: SeatEditorListProps) {
  const getProviderInfo = (id: ProviderId) => providers.find((p) => p.id === id);

  const updateSeat = (id: string, patch: Partial<SeatConfig>) => {
    onChange(seats.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleProviderChange = (seat: SeatConfig, newProvider: ProviderId) => {
    const info = getProviderInfo(newProvider);
    const firstModel = info?.models[1]?.id || info?.models[0]?.id || 'default';
    updateSeat(seat.id, {
      provider: newProvider,
      model: firstModel,
      label: info ? info.name : newProvider,
      effort: 'default',
      economyMode: newProvider === 'codex',
    });
  };

  const addSeat = () => {
    const installed = providers.filter((p) => p.installed);
    const pool = installed.length > 0 ? installed : providers;
    const pick = pool[seats.length % pool.length] || {
      id: 'antigravity' as ProviderId,
      name: 'Antigravity',
      models: [{ id: 'auto', label: 'Auto' }],
    };
    const nextModel = pick.models[Math.min(1, pick.models.length - 1)]?.id || 'auto';
    const roleCycle: SeatRole[] = [
      'general',
      'chief_architect',
      'risk_auditor',
      'product_ux',
      'mvp_pragmatist',
      'growth_strategist',
    ];
    const nextRole = roleCycle[seats.length % roleCycle.length];

    const newSeat: SeatConfig = {
      id: `seat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      label: `${pick.name} #${seats.length + 1}`,
      provider: pick.id,
      model: nextModel,
      role: nextRole,
      effort: 'default',
      economyMode: pick.id === 'codex',
      enabled: true,
    };
    onChange([...seats, newSeat]);
  };

  const removeSeat = (id: string) => {
    if (seats.length <= 1) return;
    onChange(seats.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300">
            Ajan Masası
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
            {seats.filter((s) => s.enabled).length} aktif
          </span>
        </div>

        <button
          type="button"
          onClick={addSeat}
          className="glass-pill inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full text-zinc-200 hover:text-white cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajan Ekle
        </button>
      </div>

      <div
        className={`grid gap-3 ${
          compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'
        }`}
      >
        {seats.map((seat) => {
          const info = getProviderInfo(seat.provider);
          const meta = PROVIDER_META[seat.provider];
          const knownModels = info?.models || [];
          const isCustomModel =
            seat.model !== '' && !knownModels.some((m) => m.id === seat.model);
          const isNotInstalled = info && !info.installed;

          return (
            <div
              key={seat.id}
              className={`rounded-2xl p-3.5 transition glass-card ${
                seat.enabled ? '' : 'opacity-45'
              }`}
            >
              {/* Header Row */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => updateSeat(seat.id, { enabled: !seat.enabled })}
                    title={seat.enabled ? 'Pasife al' : 'Aktifleştir'}
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition cursor-pointer ${
                      seat.enabled
                        ? 'bg-[#f7f8f8] border-[#f7f8f8]'
                        : 'bg-transparent border-white/25'
                    }`}
                  >
                    {seat.enabled && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#060709]" />
                    )}
                  </button>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                  <input
                    type="text"
                    value={seat.label}
                    onChange={(e) => updateSeat(seat.id, { label: e.target.value })}
                    className="bg-transparent text-[13px] font-semibold text-white focus:outline-none focus:bg-white/[0.06] rounded-md px-1.5 py-0.5 w-full truncate"
                    placeholder="Ajan adı"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isNotInstalled && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ff7a6e]/15 text-[#ff7a6e]">
                      CLI yok
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      updateSeat(seat.id, { economyMode: !seat.economyMode })
                    }
                    title="Ekonomik & Hızlı Mod (Kısa, yüksek yoğunluklu yanıt)"
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border transition cursor-pointer ${
                      seat.economyMode
                        ? 'bg-[#4cc58a]/15 text-[#8ae3b7] border-[#4cc58a]/35'
                        : 'bg-white/[0.03] text-zinc-500 border-white/[0.08] hover:text-zinc-200'
                    }`}
                  >
                    <Zap className="w-2.5 h-2.5" />
                    Hızlı
                  </button>
                  {seats.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSeat(seat.id)}
                      title="Kaldır"
                      className="p-1 rounded-full hover:bg-red-500/15 text-zinc-500 hover:text-[#ff7a6e] transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Clean Compact Controls */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                    Sağlayıcı
                  </label>
                  <select
                    value={seat.provider}
                    onChange={(e) =>
                      handleProviderChange(seat, e.target.value as ProviderId)
                    }
                    className="glass-input w-full text-xs rounded-xl px-2.5 py-1.5 text-zinc-100"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.installed ? '' : '(kurulu değil)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                    Model
                  </label>
                  <select
                    value={isCustomModel ? CUSTOM_MODEL_SENTINEL : seat.model}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateSeat(seat.id, {
                        model: v === CUSTOM_MODEL_SENTINEL ? '' : v,
                      });
                    }}
                    className="glass-input w-full text-xs rounded-xl px-2.5 py-1.5 text-zinc-100"
                  >
                    {knownModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                    <option value={CUSTOM_MODEL_SENTINEL}>
                      ✎ Özel Model ID...
                    </option>
                  </select>
                </div>

                {(isCustomModel || seat.model === '') && (
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={seat.model}
                      onChange={(e) => updateSeat(seat.id, { model: e.target.value })}
                      placeholder="Model ID (örn: gemini-4-neon-xhigh, claude-opus-5-5-high)"
                      className="glass-input w-full text-xs font-mono rounded-xl px-3 py-1.5 text-[#b9b4ff]"
                    />
                  </div>
                )}

                <div className={info?.supportsEffort ? '' : 'col-span-2'}>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                    Rol / Uzmanlık
                  </label>
                  <select
                    value={seat.role}
                    onChange={(e) =>
                      updateSeat(seat.id, { role: e.target.value as SeatRole })
                    }
                    className="glass-input w-full text-xs rounded-xl px-2.5 py-1.5 text-zinc-100"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {info?.supportsEffort && (
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                      Düşünme Eforu
                    </label>
                    <select
                      value={seat.effort}
                      onChange={(e) =>
                        updateSeat(seat.id, {
                          effort: e.target.value as EffortLevel,
                        })
                      }
                      className="glass-input w-full text-xs rounded-xl px-2.5 py-1.5 text-zinc-100"
                    >
                      {(info.effortOptions || ['default', 'low', 'medium', 'high']).map(
                        (lvl) => (
                          <option key={lvl} value={lvl}>
                            {EFFORT_LABELS[lvl]}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}

                {/* Inline Custom Role Definition */}
                {seat.role === 'custom' && (
                  <div className="col-span-2 space-y-1.5 pt-1">
                    <input
                      type="text"
                      value={seat.customRoleTitle || ''}
                      onChange={(e) =>
                        updateSeat(seat.id, { customRoleTitle: e.target.value })
                      }
                      placeholder="Özel Rol Adı (örn: Melek Yatırımcı, Mobil Oyun Direktörü)"
                      className="glass-input w-full text-xs rounded-xl px-3 py-1.5 text-white placeholder:text-zinc-600"
                    />
                    <input
                      type="text"
                      value={seat.customRolePrompt || ''}
                      onChange={(e) =>
                        updateSeat(seat.id, { customRolePrompt: e.target.value })
                      }
                      placeholder="Rol yönergesi (isteğe bağlı): Hangi açıdan sert analiz etsin?"
                      className="glass-input w-full text-xs rounded-xl px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
