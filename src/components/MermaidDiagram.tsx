import { useEffect, useId, useState } from 'react';
import { Check, Code2, Copy, Eye } from 'lucide-react';

let mermaidInitialized = false;

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const reactId = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const trimmed = code.trim();
    if (!trimmed) return;

    const timer = window.setTimeout(async () => {
      try {
        const mod = await import('mermaid');
        const mermaid = mod.default;
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'base',
            fontFamily: 'Montserrat, -apple-system, BlinkMacSystemFont, sans-serif',
            themeVariables: {
              darkMode: true,
              background: '#0b0c10',
              primaryColor: '#1b1e2e',
              primaryTextColor: '#f4f6fb',
              primaryBorderColor: '#7c74ff',
              lineColor: '#6f7790',
              secondaryColor: '#141926',
              tertiaryColor: '#101520',
              edgeLabelBackground: '#0e1017',
              clusterBkg: '#11141e',
              clusterBorder: '#3fd0c9',
              titleColor: '#f7f8f8',
            },
          });
          mermaidInitialized = true;
        }

        const renderId = `cpt_mmd_${reactId}_${Date.now().toString(36)}`;
        const { svg: rendered } = await mermaid.render(renderId, trimmed);
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, reactId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (failed || !svg) {
    return (
      <div className="my-3 rounded-2xl bg-black/50 border border-white/[0.08] overflow-hidden">
        <div className="px-3.5 py-1.5 border-b border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>mermaid</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-zinc-400 hover:text-white cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-[#4cc58a]" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
        <pre className="p-3.5 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-2xl bg-[#090b10]/90 border border-white/[0.09] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-white/[0.02]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#88ece7]">
          Canlı Diyagram · Mermaid
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="inline-flex items-center gap-1 text-[10.5px] px-2.5 py-0.5 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-zinc-300 hover:text-white transition cursor-pointer"
          >
            {showCode ? <Eye className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
            {showCode ? 'Görsel' : 'Kod'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[10.5px] px-2.5 py-0.5 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-zinc-300 hover:text-white transition cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-[#4cc58a]" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
      </div>

      {showCode ? (
        <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
          {code}
        </pre>
      ) : (
        <div
          className="p-4 sm:p-5 overflow-x-auto flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}
