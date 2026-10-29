import { OWNER, type Clock, type Logger, type MetabolismConfig, type MetabolismSnapshot } from '../../domain/types';
import { type Localizer, statusLines } from '../../localization';
export interface SkyMPUiApi {
  readonly apiVersion: 1;
  registerWidget(def: { id: string; owner: string; kind: 'icon-list'; schemaVersion: 1; defaultPosition: 'bottom-left'; defaultVisible: true }): void;
  unregisterWidget(owner: string, id: string): void;
  updateWidget(target: { userId: number }, widgetId: string, state: unknown): void;
  setWidgetVisible(target: { userId: number }, widgetId: string, visible: boolean): void;
  notify(target: { userId: number }, message: string, options: { tone: 'info' | 'warning'; durationMs: number }): void;
  getStatus(): { ready: boolean; apiVersion: number; frontendProtocol: number };
}
export const UI_DISCOVERY_WINDOW_MS = 30000;
const UI_DISCOVERY_INTERVAL_MS = 1000;
export interface UiApiInspection { api: SkyMPUiApi | null; reason: string; retryable: boolean }
function diagnosticValue(value: unknown): string {
  return value === undefined ? 'undefined' : value === null ? 'null' :
    typeof value === 'number' || typeof value === 'boolean' ? String(value) : typeof value;
}
export function inspectUiApi(value: unknown): UiApiInspection {
  if (value === undefined || value === null) return { api: null, reason: 'globalThis.skympUi is missing; check UI Core activation, startup errors and pluginsLoadOrder', retryable: true };
  try {
    const api = value as SkyMPUiApi;
    if (api.apiVersion !== 1) return { api: null, reason: 'apiVersion=' + diagnosticValue(api.apiVersion) + '; required=1', retryable: false };
    const missing = ['registerWidget', 'unregisterWidget', 'updateWidget', 'setWidgetVisible', 'notify', 'getStatus'].filter(k => typeof (api as any)[k] !== 'function');
    if (missing.length) return { api: null, reason: 'missing methods: ' + missing.join(', '), retryable: false };
    const status = api.getStatus();
    if (!status || typeof status !== 'object') return { api: null, reason: 'getStatus() returned an invalid status object', retryable: false };
    if (status.apiVersion !== 1) return { api: null, reason: 'getStatus().apiVersion=' + diagnosticValue(status.apiVersion) + '; required=1', retryable: false };
    if (status.frontendProtocol !== 1) return { api: null, reason: 'frontendProtocol=' + diagnosticValue(status.frontendProtocol) + '; required=1', retryable: false };
    if (status.ready !== true) return { api: null, reason: 'getStatus().ready=' + diagnosticValue(status.ready) + '; waiting for UI Core startup', retryable: true };
    return { api, reason: 'API v1 and frontend protocol v1 ready', retryable: false };
  } catch { return { api: null, reason: 'UI Core inspection/getStatus() threw an error', retryable: true }; }
}
export function detectUiApi(value: unknown): SkyMPUiApi | null { return inspectUiApi(value).api; }
export function buildWidgetState(s: Readonly<MetabolismSnapshot>, c: MetabolismConfig, l: Localizer) {
  return { schemaVersion: 1, items: statusLines(s, c, l, c.locale).map(row => ({
    label: `${row.label} (${row.hint})`, value: `${row.value} · ${l.t(row.severity)}`,
    tone: row.severity === 'healthy' ? 'success' : row.severity === 'warning' ? 'info' : row.severity === 'critical' ? 'warning' : 'error',
  })) };
}
export class UiAdapter {
  private api: SkyMPUiApi | null = null;
  private registered = false;
  private warned = false;
  private closed = false;
  private discoveryDone = false;
  private deadline: number | null = null;
  private nextAttempt = -Infinity;
  private lastDiagnostic = '';
  private readonly last = new Map<number, { revision: number; at: number; characterId: string }>();
  constructor(private readonly getApi: () => unknown, private readonly c: MetabolismConfig,
    private readonly l: Localizer, private readonly clock: Clock, private readonly log: Logger) {}
  register() {
    if (!this.c.ui.enabled || this.registered || this.closed || this.deadline !== null) return;
    this.deadline = this.clock.now() + UI_DISCOVERY_WINDOW_MS;
    this.attemptRegistration();
  }
  /** Uses the existing server scheduler; at most 31 checks during boot, no extra timer. */
  retryRegistration() {
    if (this.closed || this.discoveryDone || this.deadline === null || this.clock.now() < this.nextAttempt) return;
    if (this.clock.now() > this.deadline) { this.finishDiscovery(); return; }
    this.attemptRegistration();
  }
  private finishDiscovery() {
    this.discoveryDone = true;
    this.log.warn('[skymp-metabolism] UI Core startup discovery ended after 30s: ' + this.lastDiagnostic +
      '; engine continues without HUD. Load enabled skymp-ui-core before skymp-metabolism and restart the game server.');
  }
  private attemptRegistration() {
    this.nextAttempt = this.clock.now() + UI_DISCOVERY_INTERVAL_MS;
    let inspection: UiApiInspection;
    try { inspection = inspectUiApi(this.getApi()); }
    catch { inspection = { api: null, reason: 'Reading the UI Core service threw an error', retryable: true }; }
    if (!inspection.api) {
      if (this.lastDiagnostic !== inspection.reason) this.log.warn('[skymp-metabolism] UI Core unavailable: ' + inspection.reason +
        (inspection.retryable ? '; checking again during the first 30s; engine continues' : '; engine continues without HUD'));
      this.lastDiagnostic = inspection.reason;
      if (!inspection.retryable) this.discoveryDone = true;
      else if (this.clock.now() >= this.deadline!) this.finishDiscovery();
      return;
    }
    try {
      inspection.api.registerWidget({ id: this.c.ui.widgetId, owner: OWNER, kind: 'icon-list', schemaVersion: 1,
        defaultPosition: 'bottom-left', defaultVisible: true });
      this.api = inspection.api; this.registered = true; this.discoveryDone = true;
      this.log.info('[skymp-metabolism] UI Core connected: API v1, frontend protocol v1; widget=' + this.c.ui.widgetId);
    } catch {
      this.discoveryDone = true;
      this.log.warn('[skymp-metabolism] UI Core API v1 is ready, but widget registration failed; check widget namespace/collision; engine continues without HUD');
    }
  }
  update(userId: number, state: Readonly<MetabolismSnapshot>, force = false) {
    if (!this.registered) return;
    const last = this.last.get(userId), now = this.clock.now();
    if (!force && last && last.characterId === state.characterId &&
      (now - last.at < this.c.ui.updateIntervalSeconds * 1000 || (last.revision === state.revision && now - last.at < 30000))) return;
    try {
      this.api!.updateWidget({ userId }, this.c.ui.widgetId, buildWidgetState(state, this.c, this.l));
      // Character switches must undo the visibility flag of the previous character.
      if (!last || last.characterId !== state.characterId || force) this.api!.setWidgetVisible({ userId }, this.c.ui.widgetId, true);
      this.last.set(userId, { revision: state.revision, at: now, characterId: state.characterId }); this.warned = false;
    } catch { if (!this.warned) this.log.warn('[skymp-metabolism] UI update unavailable; core continues'); this.warned = true; }
  }
  remove(userId: number) {
    if (this.last.delete(userId)) {
      try { this.api?.setWidgetVisible({ userId }, this.c.ui.widgetId, false); } catch { /* disconnected */ }
    }
  }
  notify(userId: number, message: string, healthy: boolean): boolean {
    if (!this.registered) return false;
    try { this.api!.notify({ userId }, message, { tone: healthy ? 'info' : 'warning', durationMs: 5000 }); return true; } catch { return false; }
  }
  unregister() {
    if (this.registered) { try { this.api?.unregisterWidget(OWNER, this.c.ui.widgetId); } catch { this.log.warn('[skymp-metabolism] UI cleanup failed'); } }
    this.closed = true; this.discoveryDone = true; this.api = null; this.registered = false; this.last.clear();
  }
}
