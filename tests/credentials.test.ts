import { afterEach,expect,it,vi } from 'vitest';
const getToken=vi.hoisted(()=>vi.fn());
vi.mock('@azure/identity',()=>({DefaultAzureCredential:class{getToken=getToken;}}));
import { loadConfig } from '../server/config';
afterEach(()=>{vi.useRealTimers();getToken.mockReset();});
it('shares a credential acquisition and refreshes before the access token expires',async()=>{
  vi.useFakeTimers();vi.setSystemTime(100000);
  getToken.mockResolvedValueOnce({token:'first',expiresOnTimestamp:200000}).mockResolvedValueOnce({token:'second',expiresOnTimestamp:400000});
  const config=loadConfig({FOUNDRY_RESOURCE_ENDPOINT:'https://example.com',FOUNDRY_DEPLOYMENT:'test',FOUNDRY_AUTH:'entra'});
  const headers=await Promise.all([config.headers(),config.headers(),config.headers()]);
  expect(getToken).toHaveBeenCalledTimes(1);expect(headers.every(h=>h.Authorization==='Bearer first')).toBe(true);
  vi.setSystemTime(150000);expect(await config.headers()).toEqual({Authorization:'Bearer second'});expect(getToken).toHaveBeenCalledTimes(2);
});
it('does not cache a failed credential acquisition forever',async()=>{
  getToken.mockRejectedValueOnce(Error('not signed in')).mockResolvedValueOnce({token:'recovered',expiresOnTimestamp:Date.now()+3600000});
  const config=loadConfig({FOUNDRY_RESOURCE_ENDPOINT:'https://example.com',FOUNDRY_DEPLOYMENT:'test'});
  await expect(config.headers()).rejects.toThrow('not signed in');expect(await config.headers()).toEqual({Authorization:'Bearer recovered'});
});
