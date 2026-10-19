import { test,expect } from '@playwright/test';
test('loads full Freedoom E1M1 and manual control changes the player state',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Launch E1M1'}).click();
  await expect(page.getByRole('status')).toContainText('Level ready',{timeout:45000});
  await expect(page.locator('.telemetry')).toContainText('pistol');
  await page.getByRole('button',{name:'Manual',exact:true}).click();
  await page.keyboard.down('ControlLeft');await page.waitForTimeout(550);await page.keyboard.up('ControlLeft');
  await expect(page.locator('.telemetry')).not.toContainText('50 / 0 / 0 / 0');
  await page.getByRole('button',{name:'Restart',exact:false}).click();
  await expect(page.locator('.telemetry')).toContainText('50 / 0 / 0 / 0');
  await page.screenshot({path:`artifacts/game-${test.info().project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});
test('rejects a non-IWAD file before engine initialization',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').setInputFiles({name:'bad.wad',mimeType:'application/octet-stream',buffer:Buffer.from('not an IWAD file')});
  await page.getByRole('button',{name:'Launch E1M1'}).click();await expect(page.getByRole('status')).toContainText('valid IWAD');
});
