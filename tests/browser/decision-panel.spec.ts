import {test,expect} from '@playwright/test';
import {PROMPT_VERSION} from '../../shared/contracts';
test('each channel keeps its probabilities and DOM rows during delayed and unscored responses',async({page})=>{
  await page.route('**/api/health',r=>r.fulfill({json:{ready:true,deployment:'UI fixture'}}));
  let actions=0,release!:()=>void;const pending=new Promise<void>(r=>{release=r;});
  await page.route('**/api/decision',async route=>{
    const request=route.request().postDataJSON(),channel=request.channel;
    const number=channel==='action'?++actions:0;if(channel==='action'&&number===2)await pending;
    const choice=channel==='action'?'fire':'hold',optionScores=channel==='action'?(number===1?{fire:.7,hold:.3}:number===2?{fire:.8,hold:.2}:null):{hold:1};
    await route.fulfill({json:{requestId:request.requestId,episodeId:request.episodeId,controllerEpoch:request.controllerEpoch,channel,sequence:request.sequence,
      observationId:request.observation.observationId,choice,targetHeading:null,optionScores,model:'UI fixture',modelVersion:null,usage:null,
      serverMs:10,promptVersion:PROMPT_VERSION,diagnostics:{request:{},response:{}}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Launch E1M1'}).click();await expect(page.getByRole('status')).toContainText('Level ready',{timeout:45000});
  await page.getByRole('button',{name:'Start AI',exact:false}).click();await expect(page.getByTestId('probability-action-fire')).toHaveText('70.0%');
  await expect.poll(()=>actions).toBe(2);const row=await page.locator('[data-action="action:fire"]').elementHandle();
  await expect(page.getByTestId('decision-status')).toHaveText('Updating');await expect(page.getByTestId('probability-action-fire')).toHaveText('70.0%');
  await expect(page.getByText('Awaiting decision',{exact:true})).toHaveCount(0);release();
  await expect(page.getByTestId('probability-action-fire')).toHaveText('80.0%');expect(await page.locator('[data-action="action:fire"]').evaluate((current,previous)=>current===previous,row)).toBe(true);
  await expect.poll(()=>actions).toBeGreaterThanOrEqual(3);await page.waitForTimeout(100);await expect(page.getByTestId('probability-action-fire')).toHaveText('80.0%');
  await page.getByRole('button',{name:'Stop AI',exact:false}).click();await page.screenshot({path:`artifacts/decision-panel-${test.info().project.name}.png`,fullPage:true});
});
