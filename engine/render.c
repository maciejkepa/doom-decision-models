/* Camera interpolation only: physics, sensors and hit tests retain real tic state. */
#include <math.h>
#include <stdint.h>
#include "doomstat.h"
#include "p_local.h"
#include "bridge.h"
typedef struct {fixed_t x,y,z;angle_t angle;} Pose;
static Pose previous,current;
static int valid,lastmap,lasttic;
static double fraction=1;
void DB_RenderReset(void){valid=0;fraction=1;}
void DB_RenderAlpha(double alpha){fraction=fmax(0,fmin(1,alpha));}
void DB_RenderCapture(int before){
  player_t *p=&players[consoleplayer];if(gamestate!=GS_LEVEL||!p->mo){valid=0;return;}
  Pose next={p->mo->x,p->mo->y,p->viewz,p->mo->angle};
  if(before){previous=next;return;}
  if(!valid||lastmap!=gamemap||gametic<lasttic||hypot((double)next.x-previous.x,(double)next.y-previous.y)>128*FRACUNIT||p->health<=0)previous=next;
  current=next;lastmap=gamemap;lasttic=gametic;valid=1;
}
void DB_RenderView(int *x,int *y,int *z,unsigned int *angle){
  if(!valid)return;
  *x=previous.x+(fixed_t)(((double)current.x-previous.x)*fraction);
  *y=previous.y+(fixed_t)(((double)current.y-previous.y)*fraction);
  *z=previous.z+(fixed_t)(((double)current.z-previous.z)*fraction);
  *angle=previous.angle+(int32_t)((double)(int32_t)(current.angle-previous.angle)*fraction);
}
