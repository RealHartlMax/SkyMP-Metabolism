export interface SkyMpApi {
  on(event: string, handler: (...args: any[]) => void): unknown;
  removeListener?(event: string, handler: (...args: any[]) => void): unknown;
  isConnected(userId: number): boolean;
  getUserActor(userId: number): number;
  getUserByActor(actorId: number): number;
  getServerSettings(): { maxPlayers?: number };
  get(actorId: number, propertyName: string): unknown;
  set(actorId: number, propertyName: string, value: unknown): void;
}
export interface PlayerIdentity { userId: number; actorId: number }
export function resolveIdentity(mp: SkyMpApi, userId: number): PlayerIdentity | null {
  if (!Number.isInteger(userId) || userId < 0 || userId >= 65535) return null;
  try {
    if (!mp.isConnected(userId)) return null;
    const actorId = mp.getUserActor(userId);
    if (!Number.isSafeInteger(actorId) || actorId <= 0 || actorId > 0xffffffff || mp.getUserByActor(actorId) !== userId) return null;
    return { userId, actorId };
  } catch { return null; }
}
