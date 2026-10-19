import {expect,it} from 'vitest';
import {InferenceLimiter} from '../shared/inference-limiter';
it('allows three concurrent lanes and six starts per rolling second',()=>{
  const gate=new InferenceLimiter(),first=[gate.acquire(0),gate.acquire(10),gate.acquire(20)];
  expect(first.every(Boolean)).toBe(true);expect(gate.acquire(30)).toBeNull();first.forEach(release=>release!());
  for(const now of [200,400,600]){const release=gate.acquire(now);expect(release).not.toBeNull();release!();release!();}
  expect(gate.acquire(999)).toBeNull();expect(gate.acquire(1000)).not.toBeNull();
});
