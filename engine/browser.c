/* Fixed 35 Hz simulation, independently rendered at up to 60 Hz. */
#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <math.h>
#include <SDL.h>
#include <SDL_mixer.h>
#include "doomgeneric.h"
#include "doomstat.h"
#include "d_loop.h"
#include "bridge.h"
#include "s_sound.h"
extern int DB_Suspended(void);
extern gamestate_t wipegamestate;
extern void D_Display(void);
extern void I_StartFrame(void);
extern double DB_SnapshotCost(void);
static double previous,accumulator,last_draw,window_start,frame_cost;
static int rendered,simulated;
static double fps,tps;
static double frame_intervals[240],render_costs[240],last_rendered;
static double simulation_costs[240],simulation_cost;
static int frame_samples;
static int compare_double(const void *a,const void *b){double d=*(const double*)a-*(const double*)b;return d<0?-1:d>0;}
static double p95(double *values){int count=frame_samples<240?frame_samples:240;if(!count)return 0;double copy[240];for(int i=0;i<count;i++)copy[i]=values[i];qsort(copy,count,sizeof(double),compare_double);return copy[(int)ceil(count*.95)-1];}
static int audio_enabled=1;
EM_JS(void, draw_canvas, (uint32_t *pixels), {
  const canvas=Module['canvas'];
  const ctx=Module['doomContext']||(Module['doomContext']=canvas.getContext('2d',{alpha:false}));
  const img=Module['doomImage']||(Module['doomImage']=ctx.createImageData(640,400));
  const src=HEAPU32.subarray(pixels>>>2,(pixels>>>2)+640*400),dst=img.data;
  for(let i=0;i<src.length;i++){const c=src[i],j=i*4;dst[j]=(c>>>16)&255;dst[j+1]=(c>>>8)&255;dst[j+2]=c&255;dst[j+3]=255;}
  ctx.putImageData(img,0,0);
});
void DG_Init(void){SDL_Init(SDL_INIT_AUDIO|SDL_INIT_TIMER);}
void DG_DrawFrame(void){draw_canvas(DG_ScreenBuffer);}
void DG_SleepMs(uint32_t ms){(void)ms;}
uint32_t DG_GetTicksMs(void){return (uint32_t)emscripten_get_now();}
int DG_GetKey(int *pressed,unsigned char *key){return 0;}
void DG_SetWindowTitle(const char *title){(void)title;}
EMSCRIPTEN_KEEPALIVE void db_audio(int enabled){audio_enabled=enabled;Mix_Volume(-1,enabled?MIX_MAX_VOLUME:0);Mix_VolumeMusic(enabled?MIX_MAX_VOLUME:0);}
static void frame(void){
  double now=emscripten_get_now();
  if(DB_Suspended()){previous=now;accumulator=0;DB_RenderReset();window_start=now;rendered=simulated=0;last_rendered=0;return;}
  double elapsed=now-previous;previous=now;
  if(elapsed>100){accumulator=0;elapsed=0;DB_RenderReset();}
  accumulator+=elapsed;
  double simulation_start=emscripten_get_now();
  while(accumulator>=1000.0/35){I_StartFrame();DB_RenderCapture(1);TryRunTics();DB_RenderCapture(0);S_UpdateSounds(players[consoleplayer].mo);accumulator-=1000.0/35;simulated++;}
  simulation_cost=emscripten_get_now()-simulation_start;
  if(now+.5>=last_draw){
    double start=emscripten_get_now();DB_RenderAlpha(accumulator/(1000.0/35));wipegamestate=gamestate;D_Display();
    frame_cost=emscripten_get_now()-start;
    if(last_rendered){int at=frame_samples++%240;frame_intervals[at]=now-last_rendered;render_costs[at]=frame_cost;simulation_costs[at]=simulation_cost;}last_rendered=now;
    last_draw+=1000.0/60;if(last_draw<now)last_draw=now+1000.0/60;rendered++;
  }
  if(now-window_start>=1000){fps=rendered*1000.0/(now-window_start);tps=simulated*1000.0/(now-window_start);window_start=now;rendered=simulated=0;}
  if(!audio_enabled)Mix_Volume(-1,0);
}
EMSCRIPTEN_KEEPALIVE double db_perf(int metric){return metric==0?fps:metric==1?tps:metric==2?frame_cost:metric==3?p95(frame_intervals):metric==4?p95(render_costs):metric==5?p95(simulation_costs):DB_SnapshotCost();}
int main(int argc,char **argv){
  singletics=true;
  doomgeneric_Create(argc,argv);
  DB_Snapshot();previous=window_start=emscripten_get_now();
  emscripten_set_main_loop(frame,0,0);return 0;
}
