import type { Observation } from '../../shared/contracts';
import { angleDelta } from '../../shared/contracts';
import { hasKey, keyItem, type KeyColor } from '../../shared/keys';

type Position = { x: number; y: number; lastSeenTic: number };
export class KeyMemory {
  private episode = '';
  private locks = new Map<number, Position & { requiredKey: KeyColor; passable: boolean | null }>();
  private keys = new Map<number, Position & { color: KeyColor; kind: 'card' | 'skull' }>();

  observe(o: Observation) {
    const episode = `${o.episodeId}:${o.mapId}`;
    if (episode !== this.episode) { this.episode = episode; this.locks.clear(); this.keys.clear(); }
    const position = (distance: number, bearing: number): Position => {
      const angle = (o.player.angle + bearing) * Math.PI / 180;
      return { x: o.player.x + Math.cos(angle) * distance, y: o.player.y + Math.sin(angle) * distance, lastSeenTic: o.gameTic };
    };
    const relative = (p: Position) => ({ lastSeenTic: p.lastSeenTic, distance: Math.hypot(p.x - o.player.x, p.y - o.player.y), bearing: angleDelta(Math.atan2(p.y - o.player.y, p.x - o.player.x) * 180 / Math.PI, o.player.angle) });
    for (const surface of o.interactions) if (surface.requiredKey) {
      this.locks.delete(surface.id);
      this.locks.set(surface.id, { ...position(surface.distance, surface.bearing), requiredKey: surface.requiredKey, passable: surface.passable });
    }
    const visible = new Set<number>();
    for (const item of o.objects) {
      const key = item.kind === 'item' ? keyItem(item.type) : null;
      if (!key) continue;
      visible.add(item.id); this.keys.delete(item.id);
      this.keys.set(item.id, { ...position(item.distance, item.bearing), ...key });
    }
    for (const [id, key] of this.keys) if (hasKey(o.player.keys, key.color)) this.keys.delete(id);
    while (this.locks.size > 16) this.locks.delete(this.locks.keys().next().value!);
    while (this.keys.size > 12) this.keys.delete(this.keys.keys().next().value!);
    return {
      knownLocks: [...this.locks].map(([id, lock]) => ({ id, requiredKey: lock.requiredKey, keyAvailable: hasKey(o.player.keys, lock.requiredKey), passable: lock.passable, ...relative(lock) })),
      knownKeys: [...this.keys].map(([id, key]) => ({ id, color: key.color, kind: key.kind, visible: visible.has(id), ...relative(key) })),
    };
  }
}
