import { afterEach,describe,expect,it,vi } from 'vitest';
import { decide,parseAnswer,parseDecision,buildBody,normalizeEndpoint,redact } from '../decision-core';
import { request } from './fixtures/observation';
import fixture from './fixtures/foundry-live.json';
import channelFixture from './fixtures/foundry-channels-live.json';
import asyncFixture from './fixtures/foundry-async-live.json';
import {channelOptions, type DecisionChannel, type Observation} from '../shared/contracts';
describe('Foundry contract',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('parses an actual Decision-1 response without inventing metadata',()=>{
    const answer=parseAnswer(fixture.response,{advance:{},release:{}});
    expect(answer.choice).toBe(fixture.response.answers.action.choice);
    expect(answer.optionScores).toEqual(fixture.response.answers.action.probabilities);
    expect(answer.modelVersion).toBeNull();
  });
  it('keeps unavailable probabilities null',()=>expect(parseAnswer({answers:{action:{type:'choice',choice:'release'}}},{release:{}}).optionScores).toBeNull());
  it('rejects unknown options',()=>expect(()=>parseAnswer({answers:{action:{type:'choice',choice:'teleport'}}},{release:{}})).toThrow());
  it('does not offer unowned weapons or accept browser supplied prompts',()=>{
    expect(buildBody(request,'deployment').questions.action.criteria).not.toHaveProperty('equip_bfg');
    expect(Object.keys(buildBody(request,'deployment').questions)).toEqual(['action']);
    expect(buildBody({...request,channel:'movement'},'deployment').questions.movement.criteria).not.toHaveProperty('advance_fire');
  });
  it('parses all three decisions and rejects incomplete or invalid frames atomically',()=>{
    const answer=(choice:string)=>({type:'choice',choice,probabilities:{[choice]:1}});
    const raw={answers:{movement:answer('retreat'),view:answer('turn_left'),action:answer('fire')}};
    expect(parseDecision(raw,['pistol']).controls).toEqual({movement:'retreat',view:'turn_left',action:'fire'});
    expect(parseDecision(raw,['pistol']).optionScores).toMatchObject({'movement:retreat':1,'view:turn_left':1,'action:fire':1});
    expect(()=>parseDecision({answers:{movement:answer('advance'),action:answer('fire')}},['pistol'])).toThrow();
    expect(()=>parseDecision({answers:{...raw.answers,action:answer('equip_bfg')}},['pistol'])).toThrow();
  });
  it('parses an actual three-question Foundry response',()=>{
    const answer=parseDecision(channelFixture.response,['fist','pistol']);
    expect(answer.controls.movement).toBe(channelFixture.response.answers.movement.choice);
    expect(answer.controls.view).toBe(channelFixture.response.answers.view.choice);
    expect(answer.controls.action).toBe(channelFixture.response.answers.action.choice);
  });
  it('parses live single-question replies including a model-selected precise target',async()=>{
    for(const sample of asyncFixture.samples){
      const channel=sample.channel as DecisionChannel,o=sample.observation as Observation;
      const answer=parseAnswer(sample.response,channelOptions(o)[channel],channel);
      expect(Object.keys(sample.request.questions)).toEqual([channel]);
      if(channel==='view'){expect(answer.choice).toMatch(/^face_enemy_/);expect(channelOptions(o).view[answer.choice].targetHeading).not.toBeNull();}
      vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(sample.response))));
      const reply=await decide({...request,channel,observation:o,episodeId:o.episodeId},{endpoint:'https://example.com',deployment:'fixture',timeoutMs:1000,headers:async()=>({})});
      expect(reply.channel).toBe(channel);expect(reply.choice).toBe(answer.choice);expect(reply.sequence).toBe(request.sequence);
    }
  });
  it('normalizes the full endpoint provided by the user',()=>expect(normalizeEndpoint('https://example.services.ai.azure.com/providers/microsoft/v1/systemone')).toBe('https://example.services.ai.azure.com'));
  it('redacts credentials while preserving token counts and inventory',()=>expect(redact({Authorization:'secret',usage:{input_tokens:12},keys:[true]})).toEqual({Authorization:'[redacted]',usage:{input_tokens:12},keys:[true]}));
  it('propagates Retry-After without retrying an old observation',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('',{status:429,headers:{'Retry-After':'2'}}));vi.stubGlobal('fetch',fetcher);
    await expect(decide(request,{endpoint:'https://example.com',deployment:'x',timeoutMs:1000,headers:async()=>({})})).rejects.toMatchObject({status:429,retryAfterMs:2000});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid JSON',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>')));
    await expect(decide(request,{endpoint:'https://example.com',deployment:'x',timeoutMs:1000,headers:async()=>({})})).rejects.toMatchObject({status:502});
  });
});
