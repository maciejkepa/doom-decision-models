/* Bounded local surface sensors and actual use feedback. GPL-2.0-or-later. */
#include <math.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include "doomstat.h"
#include "interactions.h"

extern int switchlist[], numswitches;
typedef struct {int id,kind,tic;fixed_t gap;int motion,key;} Remembered;
static Remembered *remember(int id,int kind);
static Remembered memory[64];
static int remembered,replace_slot;
static int use_tic=-1,use_id=-1,use_key;
static const char *use_result="no_target";
static char json[8192];static size_t used;
static void put(const char *fmt,...){
  va_list a;va_start(a,fmt);int n=vsnprintf(json+used,sizeof(json)-used,fmt,a);va_end(a);
  if(n<0||(size_t)n>=sizeof(json)-used){used=sizeof(json)-1;return;}used+=n;
}
static int manual_door(int special){
  switch(special){case 1:case 26:case 27:case 28:case 31:case 32:case 33:case 34:case 117:case 118:return 1;default:return 0;}
}
int DB_IsUsableLine(line_t *line){
  // These are player use cases in the pinned P_UseSpecialLine, not cross/shoot triggers.
  if(manual_door(line->special))return 1;
  switch(line->special){
    case 7:case 9:case 11:case 14:case 15:case 18:case 20:case 21:case 23:case 29:
    case 41:case 49:case 50:case 51:case 55:case 71:case 101:case 102:case 103:
    case 111:case 112:case 113:case 122:case 127:case 131:case 133:case 135:case 137:case 140:
    case 42:case 43:case 45:case 60:case 61:case 62:case 63:case 64:case 65:case 66:case 67:
    case 68:case 69:case 70:case 114:case 115:case 116:case 123:case 132:case 99:case 134:case 136:case 138:case 139:return 1;
    default:return 0;
  }
}
static int required_key(int special){
  switch(special){case 26:case 32:case 99:case 133:return 1;case 27:case 34:case 136:case 137:return 2;case 28:case 33:case 134:case 135:return 3;default:return 0;}
}
static int missing_key(mobj_t *thing,int special){
  int key=required_key(special);
  return key&&thing->player&&!thing->player->cards[key-1]&&!thing->player->cards[key+2]?key:0;
}
void DB_ResetInteractions(void){remembered=replace_slot=0;memset(memory,0,sizeof(memory));use_tic=use_id=-1;use_key=0;}
void DB_UseBegin(void){use_tic=gametic;use_id=-1;use_key=0;use_result="no_target";}
int DB_UseLine(mobj_t *thing,line_t *line,int side){
  use_id=(int)(line-lines);int usable=!side&&DB_IsUsableLine(line);
  use_key=usable?missing_key(thing,line->special):0;
  side_t *face=&sides[line->sidenum[0]];
  int top=face->toptexture,mid=face->midtexture,bottom=face->bottomtexture,special=line->special;
  void *before=line->backsector?line->backsector->specialdata:NULL;
  int accepted=P_UseSpecialLine(thing,line,side); // Exactly one ordinary engine use call.
  if(!usable)use_result="unusable";
  else if(use_key){use_result="key_required";remember(use_id,manual_door(special)?1:3)->key=use_key;}
  else if(special!=line->special||top!=face->toptexture||mid!=face->midtexture||bottom!=face->bottomtexture||(line->backsector&&before!=line->backsector->specialdata))use_result="triggered";
  else use_result="no_visible_change"; // Engine return true alone does not prove activation.
  return accepted;
}
static Remembered *find(int id){for(int i=0;i<remembered;i++)if(memory[i].id==id)return &memory[i];return NULL;}
static Remembered *remember(int id,int kind){
  Remembered *m=find(id);if(m)return m;
  int at=remembered<64?remembered++:replace_slot++%64;
  memory[at]=(Remembered){id,kind,-100,0,0,0};return &memory[at];
}
static int switch_visual(line_t *line){
  side_t *s=&sides[line->sidenum[0]];
  for(int i=0;i<numswitches*2;i++)if(s->toptexture==switchlist[i]||s->midtexture==switchlist[i]||s->bottomtexture==switchlist[i])return i%2+1;
  return 0;
}
static mobj_t *observer;
static line_t *target;
static int visible;
static boolean sight(intercept_t *in){
  if(in->d.line==target){visible=1;return false;}
  P_LineOpening(in->d.line);
  return in->d.line->backsector&&openbottom<observer->z+VIEWHEIGHT&&opentop>observer->z+VIEWHEIGHT;
}
static int use_target;
static boolean use_ray(intercept_t *in){
  line_t *line=in->d.line;
  if(line->special){
    if(!P_PointOnLineSide(observer->x,observer->y,line)&&DB_IsUsableLine(line))use_target=(int)(line-lines);
    return false; // Vanilla use stops at the first special, even a non-use trigger.
  }
  P_LineOpening(line);return openrange>0;
}
static double relative(double dx,double dy,double angle){
  double b=atan2(dy,dx)*180/M_PI-angle;while(b>180)b-=360;while(b< -180)b+=360;return b;
}
typedef struct {line_t *line;int kind;double distance,bearing;} Surface;
int DB_CanUse(player_t *player){
  observer=player->mo;use_target=-1;int fine=observer->angle>>ANGLETOFINESHIFT;
  P_PathTraverse(observer->x,observer->y,observer->x+(USERANGE>>FRACBITS)*finecosine[fine],observer->y+(USERANGE>>FRACBITS)*finesine[fine],PT_ADDLINES,use_ray);
  return use_target>=0&&!missing_key(observer,lines[use_target].special);
}
static Surface seen[8];
const char *DB_Interactions(player_t *player){
  observer=player->mo;int count=0,total=0;use_target=-1;
  double px=(double)observer->x/FRACUNIT,py=(double)observer->y/FRACUNIT;
  double angle=(double)observer->angle*360/4294967296.0;
  if(gamestate==GS_LEVEL){
    // Match P_UseLines exactly: 64 units along the current engine fine-angle.
    int fine=observer->angle>>ANGLETOFINESHIFT;
    P_PathTraverse(observer->x,observer->y,observer->x+(USERANGE>>FRACBITS)*finecosine[fine],observer->y+(USERANGE>>FRACBITS)*finesine[fine],PT_ADDLINES,use_ray);
    for(int i=0;i<numlines;i++){
      line_t *line=&lines[i];Remembered *known=find(i);
      // Do not disclose secret walls, back sides, or ordinary cross-only triggers.
      if((line->flags&ML_SECRET)||P_PointOnLineSide(observer->x,observer->y,line)||(!DB_IsUsableLine(line)&&!known))continue;
      double ax=(double)line->v1->x/FRACUNIT,ay=(double)line->v1->y/FRACUNIT;
      double dx=(double)line->dx/FRACUNIT,dy=(double)line->dy/FRACUNIT,len=dx*dx+dy*dy;
      if(len<1)continue;
      double nearest=fmax(.001,fmin(.999,((px-ax)*dx+(py-ay)*dy)/len));
      if(hypot(ax+nearest*dx-px,ay+nearest*dy-py)>256)continue;
      double samples[]={nearest,.5,.25,.75,.01,.99},best=1e9,best_b=0;
      for(int j=0;j<6;j++){
        double x=ax+samples[j]*dx-px,y=ay+samples[j]*dy-py,d=hypot(x,y),b=relative(x,y,angle);
        if(d>256||d>=best||fabs(b)>45||d<.01)continue;
        target=line;visible=0;
        P_PathTraverse(observer->x,observer->y,observer->x+(fixed_t)(x*(1+1/d)*FRACUNIT),observer->y+(fixed_t)(y*(1+1/d)*FRACUNIT),PT_ADDLINES,sight);
        if(visible){best=d;best_b=b;}
      }
      if(best==1e9)continue;
      int kind=known?known->kind:manual_door(line->special)?1:switch_visual(line)?2:3;
      total++;int pos=count;for(int j=0;j<count;j++)if(best<seen[j].distance||(best==seen[j].distance&&line<seen[j].line)){pos=j;break;}
      if(pos<8){if(count<8)count++;for(int j=count-1;j>pos;j--)seen[j]=seen[j-1];seen[pos]=(Surface){line,kind,best,best_b};}
    }
  }
  used=0;put("\"interactions\":[");
  for(int i=0;i<count;i++){
    Surface s=seen[i];line_t *line=s.line;int id=(int)(line-lines);Remembered *m=remember(id,s.kind);
    // Classify only surfaces that passed the visible/front-side sensor above.
    // The requirement must be observable before AI's missing-key use guard.
    int key=required_key(line->special);if(key)m->key=key;
    P_LineOpening(line);fixed_t gap=openrange;
    if(gametic!=m->tic){m->motion=m->tic==gametic-1?(gap>m->gap?1:gap<m->gap?-1:0):0;m->gap=gap;m->tic=gametic;}
    int passable=line->backsector&&!(line->flags&ML_BLOCKING)&&gap>=observer->height&&opentop-observer->z>=observer->height&&openbottom-observer->z<=24*FRACUNIT;
    const char *state=s.kind==1?(m->motion>0?"opening":m->motion<0?"closing":passable?"open":"closed"):(switch_visual(line)==2||!line->special)?"activated":"ready";
    put("%s{\"id\":%d,\"kind\":\"%s\",\"distance\":%.2f,\"bearing\":%.2f,\"inReach\":%s,\"canUseNow\":%s,\"activationAvailable\":%s,\"state\":\"%s\",\"passable\":",i?",":"",id,s.kind==1?"door":s.kind==2?"switch":"surface",s.distance,s.bearing,s.distance<=64?"true":"false",use_target==id?"true":"false",DB_IsUsableLine(line)?"true":"false",state);
    if(s.kind==1)put("%s,\"openingHeight\":%.2f",passable?"true":"false",(double)gap/FRACUNIT);
    else put("null,\"openingHeight\":null");
    if(m->key)put(",\"requiredKey\":\"%s\",\"keyAvailable\":%s}",m->key==1?"blue":m->key==2?"yellow":"red",player->cards[m->key-1]||player->cards[m->key+2]?"true":"false");
    else put(",\"requiredKey\":null,\"keyAvailable\":null}");
  }
  put("],\"truncatedInteractions\":%d,\"lastUse\":",total-count);
  if(use_tic<0)put("null");
  else{
    put("{\"tic\":%d,\"targetId\":",use_tic);if(use_id<0)put("null");else put("%d",use_id);
    put(",\"result\":\"%s\",\"requiredKey\":",use_result);
    if(use_key)put("\"%s\"",use_key==1?"blue":use_key==2?"yellow":"red");else put("null");put("}");
  }
  return json;
}
