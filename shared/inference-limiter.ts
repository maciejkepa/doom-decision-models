/** Per-instance limits with no queue of stale observations. */
export class InferenceLimiter{
  private starts:number[]=[];private active=0;
  acquire(now=Date.now()):(()=>void)|null{
    this.starts=this.starts.filter(t=>now-t<1000);
    if(this.active>=3||this.starts.length>=6)return null;
    this.starts.push(now);this.active++;let released=false;
    return ()=>{if(!released){released=true;this.active--;}};
  }
}
