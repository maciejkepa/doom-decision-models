export const KEY_COLORS = ['blue', 'yellow', 'red'] as const;
export type KeyColor = typeof KEY_COLORS[number];
type KeyItem = { color: KeyColor; kind: 'card' | 'skull' };
const sprites: Record<string, KeyItem> = {
  BKEY: { color: 'blue', kind: 'card' }, YKEY: { color: 'yellow', kind: 'card' }, RKEY: { color: 'red', kind: 'card' },
  BSKU: { color: 'blue', kind: 'skull' }, YSKU: { color: 'yellow', kind: 'skull' }, RSKU: { color: 'red', kind: 'skull' },
};
export function keyItem(sprite: string): KeyItem | null { return Object.hasOwn(sprites,sprite) ? sprites[sprite] : null; }
export function hasKey(keys: readonly boolean[], color: KeyColor) {
  const index = KEY_COLORS.indexOf(color);
  return !!(keys[index] || keys[index + 3]);
}
export function keyInventory(keys: readonly boolean[]): Record<KeyColor, boolean> {
  return { blue: hasKey(keys, 'blue'), yellow: hasKey(keys, 'yellow'), red: hasKey(keys, 'red') };
}
