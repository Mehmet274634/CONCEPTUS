import { spawn, type ChildProcess } from 'node:child_process';
import { getProviderById } from './discovery.ts';
import type { EffortLevel, ProviderId } from './types.ts';

export interface RunCliOptions {
  provider: ProviderId;
  model: string;
  effort: EffortLevel;
  prompt: string;
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
}

export interface RunCliResult {
  content: string;
  durationMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

function killProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
}

function spawnResolved(resolvedPath: string, args: string[], cwd: string): ChildProcess {
  const env = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
  };

  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedPath)) {
    return spawn('cmd.exe', ['/d', '/s', '/c', resolvedPath, ...args], {
      cwd,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  return spawn(resolvedPath, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function buildCliArgs(
  provider: ProviderId,
  model: string,
  effort: EffortLevel
): string[] {
  const cleanModel = model.trim();
  const hasExplicitModel =
    cleanModel !== '' && cleanModel !== 'default' && cleanModel !== 'auto';

  switch (provider) {
    case 'claude': {
      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--safe-mode',
        '--no-session-persistence',
        '--tools',
        '',
      ];
      if (hasExplicitModel) {
        args.push('--model', cleanModel);
      }
      if (effort && effort !== 'default') {
        args.push('--effort', effort);
      }
      return args;
    }

    case 'codex': {
      const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--ephemeral',
        '-s',
        'read-only',
      ];
      if (hasExplicitModel) {
        args.push('-m', cleanModel);
      }
      if (effort && effort !== 'default') {
        const mapped = effort === 'max' ? 'high' : effort;
        args.push('-c', `model_reasoning_effort="${mapped}"`);
      }
      // Read prompt from stdin
      args.push('-');
      return args;
    }

    case 'antigravity': {
      const args = [
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--disable-slash-commands',
      ];
      if (hasExplicitModel) {
        args.push('--model', cleanModel);
      }
      // Antigravity model IDs often bake effort into the slug (e.g. gemini-3.8-flash-medium); avoid conflict
      const modelEncodesEffort = /-(low|medium|high|xhigh|max)$/i.test(cleanModel);
      if (effort && effort !== 'default' && !modelEncodesEffort) {
        args.push('--effort', effort);
      }
      return args;
    }

    case 'gemini': {
      const args = [
        '--skip-trust',
        '-p',
        'Yukaridaki baglam ve talimatlara tam uyarak Turkce yanit ver.',
        '-o',
        'stream-json',
        '--approval-mode',
        'plan',
      ];
      if (hasExplicitModel) {
        args.push('-m', cleanModel);
      }
      return args;
    }
  }
}

interface ParseState {
  fullText: string;
  receivedDelta: boolean;
  errorMsg?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

function emitChunk(state: ParseState, text: string, onDelta: (c: string) => void, isDelta: boolean) {
  if (!text) return;
  if (isDelta) {
    state.receivedDelta = true;
    state.fullText += text;
    onDelta(text);
    return;
  }
  // Full message fallback: only emit if we haven't already streamed deltas for it
  if (!state.receivedDelta) {
    if (text.startsWith(state.fullText)) {
      const diff = text.slice(state.fullText.length);
      if (diff) {
        state.fullText = text;
        onDelta(diff);
      }
    } else if (!state.fullText) {
      state.fullText = text;
      onDelta(text);
    }
  }
}

function parseJsonLine(
  provider: ProviderId,
  line: string,
  state: ParseState,
  onDelta: (c: string) => void
) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let obj: Record<string, any>;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    // Plain text fallback (e.g. if a CLI returns raw text lines)
    if (!trimmed.startsWith('Approval mode overridden')) {
      emitChunk(state, trimmed + '\n', onDelta, true);
    }
    return;
  }

  if (provider === 'claude') {
    // Live partial token deltas
    if (obj.type === 'stream_event') {
      const ev = obj.event;
      if (ev?.type === 'content_block_delta' && ev?.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
        emitChunk(state, ev.delta.text, onDelta, true);
      }
      return;
    }

    if (obj.type === 'assistant') {
      if (obj.is_api_error_message || obj.error) {
        const errText =
          obj.message?.content?.find((c: any) => c?.type === 'text')?.text ||
          obj.error ||
          'Claude API/kota hatası';
        state.errorMsg = String(errText);
        return;
      }
      const blocks = obj.message?.content;
      if (Array.isArray(blocks)) {
        const text = blocks
          .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
          .map((b: any) => b.text)
          .join('');
        if (text) emitChunk(state, text, onDelta, false);
      }
      return;
    }

    if (obj.type === 'result') {
      if (obj.usage) {
        state.usage = {
          inputTokens: obj.usage.input_tokens,
          outputTokens: obj.usage.output_tokens,
        };
      }
      if (obj.is_error) {
        state.errorMsg = String(obj.result || obj.api_error || 'Claude oturumu hata ile bitti');
      } else if (typeof obj.result === 'string' && obj.result.trim()) {
        emitChunk(state, obj.result, onDelta, false);
      }
    }
    return;
  }

  if (provider === 'codex') {
    if (obj.type === 'error' || obj.type === 'turn.failed') {
      state.errorMsg = String(obj.message || obj.error?.message || 'Codex hatası');
      return;
    }
    if (
      (obj.type === 'item.delta' || obj.type === 'agent_message_delta') &&
      typeof (obj.delta?.text ?? obj.delta) === 'string'
    ) {
      const txt = typeof obj.delta === 'string' ? obj.delta : obj.delta.text;
      emitChunk(state, txt, onDelta, true);
      return;
    }
    if (obj.type === 'item.completed' && obj.item) {
      const item = obj.item;
      if (item.type === 'agent_message' || item.type === 'message') {
        const text =
          typeof item.text === 'string'
            ? item.text
            : Array.isArray(item.content)
              ? item.content.map((c: any) => c?.text || '').join('')
              : '';
        if (text) emitChunk(state, text, onDelta, false);
      }
      return;
    }
    if (obj.type === 'turn.completed' && obj.usage) {
      state.usage = {
        inputTokens: obj.usage.input_tokens,
        outputTokens: obj.usage.output_tokens,
      };
    }
    return;
  }

  // Antigravity CLI (agy --output-format stream-json)
  if (provider === 'antigravity') {
    if (obj.event === 'step_update' && obj.step_update) {
      const su = obj.step_update;
      if (su.step_type === 'agent_response' && typeof su.text_delta === 'string') {
        emitChunk(state, su.text_delta, onDelta, true);
      }
      return;
    }

    if (obj.event === 'result' && obj.result) {
      const res = obj.result;
      if (res.usage) {
        state.usage = {
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
        };
      }
      if (res.status === 'ERROR' || res.error) {
        state.errorMsg = String(res.error || 'Antigravity CLI hatası');
      } else if (typeof res.response === 'string' && res.response) {
        emitChunk(state, res.response, onDelta, false);
      }
      return;
    }
    return;
  }

  // Gemini CLI (stream-json common patterns)
  if (obj.type === 'error' || obj.error) {
    const msg =
      typeof obj.error === 'string'
        ? obj.error
        : obj.error?.message || obj.message || 'CLI hatası';
    state.errorMsg = String(msg);
    return;
  }

  if (obj.type === 'message' && (obj.role === 'assistant' || obj.role === 'model')) {
    const content = typeof obj.content === 'string' ? obj.content : '';
    if (content) {
      emitChunk(state, content, onDelta, Boolean(obj.delta));
    }
    return;
  }

  if (typeof obj.delta === 'string') {
    emitChunk(state, obj.delta, onDelta, true);
    return;
  }

  if (obj.type === 'content_block_delta' && typeof obj.delta?.text === 'string') {
    emitChunk(state, obj.delta.text, onDelta, true);
    return;
  }

  if (obj.type === 'result') {
    if (obj.stats) {
      state.usage = {
        inputTokens: obj.stats.input_tokens,
        outputTokens: obj.stats.output_tokens,
      };
    }
    if (obj.status === 'error') {
      state.errorMsg = String(obj.error?.message || obj.message || 'İşlem başarısız');
    } else if (typeof obj.response === 'string' && obj.response) {
      emitChunk(state, obj.response, onDelta, false);
    } else if (typeof obj.result === 'string' && obj.result) {
      emitChunk(state, obj.result, onDelta, false);
    }
    return;
  }

  if (typeof obj.text === 'string' && obj.text) {
    emitChunk(state, obj.text, onDelta, true);
  }
}

function summarizeStderr(stderr: string): string {
  const clean = stderr.trim();
  if (!clean) return '';
  if (clean.includes('IneligibleTierError')) {
    return 'Gemini CLI bireysel ücretsiz hesap desteğini kapattı; Google Antigravity CLI (agy) kurulup kullanılmalı.';
  }
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('at ') && !l.startsWith('Approval mode overridden'));
  return lines.slice(0, 4).join(' | ').slice(0, 450);
}

export async function runCliSeat(options: RunCliOptions): Promise<RunCliResult> {
  const providerInfo = await getProviderById(options.provider);
  if (!providerInfo || !providerInfo.installed || !providerInfo.resolvedPath) {
    const hint = providerInfo?.installHint ? ` Kurulum: ${providerInfo.installHint}` : '';
    throw new Error(`${options.provider} CLI bilgisayarında kurulu değil.${hint}`);
  }

  const startedAt = Date.now();
  const args = buildCliArgs(options.provider, options.model, options.effort);
  const child = spawnResolved(providerInfo.resolvedPath, args, process.cwd());

  return new Promise<RunCliResult>((resolve, reject) => {
    const state: ParseState = {
      fullText: '',
      receivedDelta: false,
    };
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const onAbort = () => {
      killProcessTree(child);
      if (!settled) {
        settled = true;
        reject(new Error('ABORTED'));
      }
    };

    if (options.signal.aborted) {
      onAbort();
      return;
    }
    options.signal.addEventListener('abort', onAbort, { once: true });

    // Timeout safety (5 minutes per turn)
    const timer = setTimeout(() => {
      killProcessTree(child);
      if (!settled) {
        settled = true;
        reject(new Error('Zaman aşımı (5 dakika).'));
      }
    }, 5 * 60 * 1000);

    const cleanup = () => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onAbort);
    };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {
        parseJsonLine(options.provider, line, state, options.onDelta);
      }
    });

    child.stderr?.on('data', (chunk: string) => {
      stderrBuf += chunk;
    });

    child.on('error', (err) => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error(`Süreç başlatılamadı: ${err.message}`));
      }
    });

    child.on('close', (code) => {
      cleanup();
      if (stdoutBuf.trim()) {
        parseJsonLine(options.provider, stdoutBuf, state, options.onDelta);
      }
      if (settled) return;
      settled = true;

      if (state.errorMsg) {
        reject(new Error(state.errorMsg));
        return;
      }

      if (code !== 0 && !state.fullText.trim()) {
        const errDetail = summarizeStderr(stderrBuf) || `CLI çıkış kodu: ${code}`;
        reject(new Error(errDetail));
        return;
      }

      if (!state.fullText.trim()) {
        const errDetail = summarizeStderr(stderrBuf) || 'Modelden boş yanıt döndü.';
        reject(new Error(errDetail));
        return;
      }

      resolve({
        content: state.fullText.trim(),
        durationMs: Date.now() - startedAt,
        usage: state.usage,
      });
    });

    // Write UTF-8 prompt to stdin cleanly (bypasses Windows argv length limits!)
    try {
      const payload =
        options.provider === 'antigravity'
          ? JSON.stringify({ event: 'user', message: { content: options.prompt } }) + '\n'
          : options.prompt;
      child.stdin?.write(payload, 'utf8');
      child.stdin?.end();
    } catch (err: any) {
      cleanup();
      killProcessTree(child);
      if (!settled) {
        settled = true;
        reject(new Error(`Prompt gönderilemedi: ${err?.message || err}`));
      }
    }
  });
}
