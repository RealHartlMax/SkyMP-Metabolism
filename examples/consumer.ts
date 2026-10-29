import type { SkyMpMetabolismApiV1 } from '../src/api';
/** Trusted server plugin; receives characterId from a verified server CharacterProvider. */
export function subscribe(api: SkyMpMetabolismApiV1) {
  if (api.apiVersion !== 1 || !api.getStatus().ready) throw new Error('Metabolism API v1 required');
  return api.onStateChange('example-healer', (state, changed) => {
    if (changed.includes('rest') && state.rest <= 10) console.info('[example-healer] Character needs rest');
  });
}
export function registerTestFood(api: SkyMpMetabolismApiV1) {
  // Fixture only: no Skyrim Form-ID is claimed, no items are created or consumed.
  api.registerConsumable({ owner: 'example-healer', key: 'example-healer:test-bread', itemId: 'fixture:bread', effects: { satiety: 15 } });
  return () => api.unregisterConsumable('example-healer', 'example-healer:test-bread');
}
