import { OWNER, type Logger, type MetabolismConfig, type MetabolismSnapshot } from '../../domain/types';
import { type Localizer, statusLines } from '../../localization';
export interface ChatCommandContext {
  readonly userId: number; readonly actorId: number | null; readonly locale: string; readonly signal: AbortSignal;
  reply(message: string): void; error(message: string): void;
}
export interface SkyMPChatApi {
  readonly apiVersion: 1;
  registerCommand(def: { owner: string; name: string; description: string; usage: string; execute(ctx: ChatCommandContext): void }): void;
  unregisterCommand(owner: string, name: string): void;
  sendToPlayer(userId: number, message: string, category?: 'system' | 'command' | 'error'): void;
}
export function detectChatApi(value: unknown): SkyMPChatApi | null {
  const api = value as SkyMPChatApi | undefined;
  return api?.apiVersion === 1 && ['registerCommand', 'unregisterCommand', 'sendToPlayer'].every(k => typeof (api as any)[k] === 'function') ? api : null;
}
export class ChatAdapter {
  private readonly registered: string[] = [];
  constructor(private readonly api: SkyMPChatApi | null, private readonly c: MetabolismConfig,
    private readonly l: Localizer, private readonly getSnapshot: (userId: number, actorId: number | null) => Readonly<MetabolismSnapshot> | null,
    private readonly log: Logger) {}
  register() {
    if (!this.c.chat.enabled || this.registered.length) return;
    if (!this.api) { this.log.warn('[skymp-metabolism] Chat API v1 unavailable; engine continues without commands'); return; }
    for (const name of new Set([this.c.chat.statusCommand, 'metabolism'])) {
      try {
        // The real registry atomically checks ALL commands and aliases, including hidden commands.
        this.api.registerCommand({ owner: OWNER, name, description: this.l.t('statusDescription'), usage: '/' + name,
          execute: ctx => {
            if (ctx.signal.aborted) return;
            try {
              const s = this.getSnapshot(ctx.userId, ctx.actorId);
              if (!s) { ctx.error(this.l.t('statusUnavailable', ctx.locale)); return; }
              ctx.reply(this.l.t('title', ctx.locale));
              for (const row of statusLines(s, this.c, this.l, ctx.locale))
                ctx.reply(`${row.label}: ${row.value} (${row.hint})`);
            } catch { ctx.error(this.l.t('statusError', ctx.locale)); }
          },
        }); this.registered.push(name);
      } catch { this.log.warn('[skymp-metabolism] Cannot register /' + name + '; existing command kept'); }
    }
  }
  notify(userId: number, message: string): boolean {
    if (!this.api || !this.c.chat.enabled) return false;
    try { this.api.sendToPlayer(userId, message, 'command'); return true; } catch { return false; }
  }
  unregister() {
    for (const name of this.registered.splice(0)) {
      try { this.api?.unregisterCommand(OWNER, name); } catch { this.log.warn('[skymp-metabolism] Chat cleanup failed'); }
    }
  }
}
