/* Project bridge for doomgeneric. GPL-2.0-or-later, like the linked engine. */
#include <emscripten.h>
#include <math.h>
#include <stdio.h>
#include <stdarg.h>
#include <stdint.h>
#include <string.h>
#include "doomstat.h"
#include "g_game.h"
#include "p_local.h"
#include "r_main.h"
#include "bridge.h"
#include "interactions.h"

static char snapshot[32768]="{}";
static double snapshot_cost;
double DB_SnapshotCost(void){return snapshot_cost;}
static size_t used;
static int overflow;
static int epoch, action_id, remaining, pending, applied=-1, suspended, manual_bits;
static int channel_mode,channel_codes[3],channel_tics[3];
static double valid_until, hold_until;
typedef struct {int seq,code,pending,applied,end,ticks,blocked_tics,point_mode;double deadline,until,target,origin,speed,progress,point_x,point_y;} Channel;
static Channel channels[3];
static fixed_t movement_x,movement_y;static double movement_dx,movement_dy;static int measure_movement;
static fixed_t last_motion_x,last_motion_y;static mobj_t *last_motion_actor;static double own_motion_x,own_motion_y;
static double input_last,expired_idle_ms[3];static int lease_expirations[3];
EMSCRIPTEN_KEEPALIVE double db_input_stat(int ch,int metric){return ch>=0&&ch<3?(metric?expired_idle_ms[ch]:lease_expirations[ch]):0;}
static const char *channel_names[]={"movement","view","action"};
static const char *end_names[]={"idle","running","completed","expired","released","passed","superseded","blocked"};
static double delta_angle(double to,double from){double d=fmod(to-from+540,360);if(d<0)d+=360;return d-180;}
static double player_angle(void){return (double)players[consoleplayer].mo->angle*360.0/4294967296.0;}
static double point_heading(Channel *c){mobj_t *me=players[consoleplayer].mo;double angle=atan2(c->point_y-(double)me->y/FRACUNIT,c->point_x-(double)me->x/FRACUNIT)*180.0/3.141592653589793;return angle<0?angle+360:angle;}
static int completed, last_hp=-1, last_dead, sequence, episode=1;
typedef struct {int seq,tic,type,value;} Event;
static Event events[32];
static const char *event_names[]={"damage","pickup","death","exit","restart","use","applied","expired"};
static const char *weapon_names[]={"fist","pistol","shotgun","chaingun","rocket","plasma","bfg","chainsaw","super_shotgun"};
static void put(const char *fmt,...) {
  if(overflow) return;
  va_list a;va_start(a,fmt);int n=vsnprintf(snapshot+used,sizeof(snapshot)-used,fmt,a);va_end(a);
  if(n<0||(size_t)n>=sizeof(snapshot)-used){overflow=1;strcpy(snapshot,"{}");return;}used+=(size_t)n;
}
void DB_Event(int type,int value){
  if(type<0||type>7)return;
  if(type==3)completed=1;
  Event *e=&events[sequence%32]; e->seq=++sequence;e->tic=gametic;e->type=type;e->value=value;
}
EMSCRIPTEN_KEEPALIVE void db_release_channel(int ch){if(ch<0||ch>2)return;channels[ch].pending=0;channels[ch].until=0;channels[ch].speed=0;channels[ch].end=4;}
EMSCRIPTEN_KEEPALIVE void db_release(void){for(int i=0;i<3;i++)db_release_channel(i);action_id=remaining=pending=manual_bits=channel_mode=0;memset(channel_codes,0,sizeof(channel_codes));memset(channel_tics,0,sizeof(channel_tics));}
EMSCRIPTEN_KEEPALIVE void db_epoch(int value){epoch=value;db_release();memset(channels,0,sizeof(channels));}
EMSCRIPTEN_KEEPALIVE void db_suspend(int value){suspended=value;db_release();DB_RenderReset();}
int DB_Suspended(void){return suspended;}
EMSCRIPTEN_KEEPALIVE void db_manual(int bits){db_release();manual_bits=bits;}
EMSCRIPTEN_KEEPALIVE int db_apply_channel(int ch,int code,int seq,double target,double origin,int expected_epoch,double deadline,int point_mode,double point_x,double point_y){
  if(ch<0||ch>2||seq<=channels[ch].seq||expected_epoch!=epoch||suspended||gamestate!=GS_LEVEL||completed||players[consoleplayer].health<=0||emscripten_get_now()>deadline)return 0;
  if((ch==0&&(code<0||code>4))||(ch==1&&(code<0||code>7))||(ch==2&&!((code>=0&&code<=3)||(code>=20&&code<=28))))return 0;
  if(ch==1&&code&&(!isfinite(target)||target<0||target>=360||!isfinite(origin)))return 0;
  if(point_mode&&!(point_mode==1&&ch==1&&code==7&&isfinite(point_x)&&isfinite(point_y)))return 0;
  if(ch==2&&code>=20&&!players[consoleplayer].weaponowned[code-20])return 0;
  Channel *c=&channels[ch];double speed=c->speed;
  *c=(Channel){.seq=seq,.code=code,.pending=1,.applied=-1,.deadline=deadline,.target=target,.origin=origin,.speed=speed,.point_mode=point_mode,.point_x=point_x,.point_y=point_y};
  channel_mode=2;action_id=remaining=pending=manual_bits=0;return 1;
}
EMSCRIPTEN_KEEPALIVE int db_channel_applied(int ch,int seq){if(ch<0||ch>2||channels[ch].seq!=seq)return -2;Channel *c=&channels[ch];return c->applied<0&&!c->pending?-2:c->applied;}
EMSCRIPTEN_KEEPALIVE int db_apply_channels(int movement,int movement_tics,int view,int view_tics,int activity,int activity_tics,int expected_epoch,double deadline){
  if(expected_epoch!=epoch||suspended||gamestate!=GS_LEVEL||completed||players[consoleplayer].health<=0||emscripten_get_now()>deadline)return 0;
  if(movement<0||movement>4||view<0||view>6||!((activity>=0&&activity<=3)||(activity>=20&&activity<=28)))return 0;
  if(movement_tics<0||movement_tics>10||view_tics<0||view_tics>10||activity_tics<0||activity_tics>10)return 0;
  if(activity>=20&&!players[consoleplayer].weaponowned[activity-20])return 0;
  db_release();channel_mode=1;channel_codes[0]=movement;channel_codes[1]=view;channel_codes[2]=activity;
  channel_tics[0]=movement_tics;channel_tics[1]=view_tics;channel_tics[2]=activity_tics;
  valid_until=deadline;pending=1;applied=-1;return 1;
}
EMSCRIPTEN_KEEPALIVE int db_apply(int code,int tics,int expected_epoch,double deadline){
  if(expected_epoch!=epoch||suspended||gamestate!=GS_LEVEL||completed||players[consoleplayer].health<=0)return 0;
  if(code<1||code>33||tics<0||tics>10)return 0;
  if(emscripten_get_now()>deadline)return 0;
  if(code>=20&&code<=28&&!players[consoleplayer].weaponowned[code-20])return 0;
  db_release();action_id=code;remaining=tics;valid_until=deadline;pending=1;applied=-1;return 1;
}
EMSCRIPTEN_KEEPALIVE int db_applied(void){return applied;}
EMSCRIPTEN_KEEPALIVE int db_channel_remaining(int channel){return channel>=0&&channel<3&&channel_mode?channel_tics[channel]:0;}
EMSCRIPTEN_KEEPALIVE void db_restart(int skill,int new_epoch){
  db_epoch(new_epoch);completed=last_dead=0;last_hp=-1;episode++;suspended=0;DB_ResetInteractions();DB_RenderReset();
  last_motion_actor=NULL;own_motion_x=own_motion_y=0;
  memset(expired_idle_ms,0,sizeof(expired_idle_ms));memset(lease_expirations,0,sizeof(lease_expirations));input_last=0;
  G_DeferedInitNew((skill_t)(skill-1),1,1);DB_Event(4,episode);
}
void DB_Input(ticcmd_t *cmd){
  memset(cmd,0,sizeof(*cmd));
  measure_movement=0;
  if(suspended||completed||gamestate!=GS_LEVEL||players[consoleplayer].health<=0){db_release();return;}
  double now=emscripten_get_now();
  for(int i=0;i<3;i++)if(channels[i].end==3&&input_last)expired_idle_ms[i]+=fmin(100,now-input_last);
  input_last=now;
  if(channel_mode==2){
    for(int i=0;i<3;i++){
      Channel *c=&channels[i];
      if(c->pending){
        c->pending=0;
        if(now>c->deadline){c->end=3;c->until=0;continue;}
        if(i==2&&(c->code==2||c->code==3)){
          int aligned_point=channels[1].point_mode&&cmd->angleturn==0&&fabs(delta_angle(point_heading(&channels[1]),player_angle()))<=.5;
          if(channels[0].end==1||channels[0].pending||(channels[1].end==1&&!aligned_point)||channels[1].pending||(c->code==2&&!DB_CanUse(&players[consoleplayer]))){c->end=4;c->until=0;continue;}
        }
        c->applied=gametic;c->end=c->code?1:2;c->until=now+(i==1?750:650);DB_Event(6,200+i);
        if(i==1&&c->code&&!c->point_mode){
          double requested=delta_angle(c->target,c->origin),travelled=delta_angle(player_angle(),c->origin);
          if(fabs(requested)<=.5||(requested>0&&travelled>=requested-.5)||(requested<0&&travelled<=requested+.5)){c->until=0;c->speed=0;c->end=5;}
        }
        if(i==2&&(c->code==2||c->code>=20))c->until=now+(c->code==2?2:1)*1000.0/35;
      }
      if(c->end!=1)continue;
      if(now>=c->until){c->end=3;c->speed=0;lease_expirations[i]++;continue;}
      if(i==0){
        if(c->code==1)cmd->forwardmove=14;if(c->code==2)cmd->forwardmove=-25;if(c->code==3)cmd->sidemove=-12;if(c->code==4)cmd->sidemove=12;
        mobj_t *me=players[consoleplayer].mo;movement_x=me->x;movement_y=me->y;
        double direction=(player_angle()+(c->code==2?180:c->code==3?90:c->code==4?-90:0))*3.141592653589793/180;
        movement_dx=cos(direction);movement_dy=sin(direction);measure_movement=c->code!=0;c->ticks++;
      }
      if(i==1){
        double target_rate=0;
        if(c->point_mode){
          mobj_t *me=players[consoleplayer].mo;
          double dx=c->point_x-(double)me->x/FRACUNIT,dy=c->point_y-(double)me->y/FRACUNIT;
          if(hypot(dx,dy)<=16){c->end=5;c->speed=0;continue;}
          // Only the supplied snapshot point and our own position are used.
          // Never read an enemy actor to refresh this point.
          c->target=point_heading(c);
          // The bearing rate comes from observed own travel, so renewing or
          // changing a model-selected point cannot create a fake target speed.
          target_rate=(dy*own_motion_x-dx*own_motion_y)/(dx*dx+dy*dy)*35*180.0/3.141592653589793;
        }
        double error=delta_angle(c->target,player_angle());
        if(fabs(error)<=.5&&(!c->point_mode||fabs(target_rate)<.5)){if(!c->point_mode)c->end=2;c->speed=0;continue;}
        int moving_point=c->point_mode&&fabs(target_rate)>=.5;
        double desired=moving_point?fmax(-90,fmin(90,target_rate+12*error)):fmin(90,sqrt(2*720*fabs(error)))*(error>0?1:-1),change=720.0/35;
        c->speed+=fmax(-change,fmin(change,desired-c->speed));
        double step=c->speed/35;
        if(c->point_mode&&step*desired<0)step=0;
        if(!moving_point){if(step*error<0)step=0;if(fabs(step)>fabs(error))step=error;}
        cmd->angleturn=(short)lrint(step*65536.0/360);
      }
      if(i==2){if(c->code==1)cmd->buttons|=BT_ATTACK;if(c->code==2)cmd->buttons|=BT_USE;if(c->code>=20)cmd->buttons|=BT_CHANGE|((c->code-20)<<BT_WEAPONSHIFT);if(c->code==3){c->end=2;c->until=0;}}
    }
    return;
  }
  if(pending){
    pending=0;
    if(now>valid_until){db_release();DB_Event(7,0);return;}
    applied=gametic;hold_until=now+300;DB_Event(6,channel_mode?100:action_id);
  }
  if(channel_mode){
    if(now>=hold_until){db_release();return;}
    int move=channel_tics[0]>0?channel_codes[0]:0,view=channel_tics[1]>0?channel_codes[1]:0,activity=channel_tics[2]>0?channel_codes[2]:0;
    if(move==1)cmd->forwardmove=25;if(move==2)cmd->forwardmove=-25;
    if(move==3)cmd->sidemove=-24;if(move==4)cmd->sidemove=24;
    if(view==1||view==3)cmd->angleturn=640;if(view==2||view==4)cmd->angleturn=-640;
    if(view==5)cmd->angleturn=1024;if(view==6)cmd->angleturn=-1024;
    if(activity==1)cmd->buttons|=BT_ATTACK;if(activity==2)cmd->buttons|=BT_USE;
    if(activity>=20)cmd->buttons|=BT_CHANGE|((activity-20)<<BT_WEAPONSHIFT);
    for(int i=0;i<3;i++)if(channel_tics[i]>0)channel_tics[i]--;
    return;
  }
  if(action_id&&(now>=hold_until||remaining<=0)){action_id=remaining=0;}
  int a=action_id;
  if(a==1||a==8||a==30||a==31)cmd->forwardmove=25;
  if(a==2||a==18||a==32||a==33)cmd->forwardmove=-25;
  if(a==3||a==9)cmd->sidemove=-24;
  if(a==4||a==10)cmd->sidemove=24;
  if(a==5||a==15)cmd->angleturn=640;
  if(a==6||a==16)cmd->angleturn=-640;
  if(a==13)cmd->angleturn=1024;
  if(a==14)cmd->angleturn=-1024;
  if(a==19||a==30||a==32)cmd->angleturn=320;
  if(a==29||a==31||a==33)cmd->angleturn=-320;
  if((a>=7&&a<=10)||a==18||a==19||(a>=29&&a<=33))cmd->buttons|=BT_ATTACK;
  if(a==11)cmd->buttons|=BT_USE;
  if(a>=20&&a<=28)cmd->buttons|=BT_CHANGE|((a-20)<<BT_WEAPONSHIFT);
  if(remaining>0)remaining--;
  if(manual_bits&1)cmd->forwardmove+=25;
  if(manual_bits&2)cmd->forwardmove-=25;
  if(manual_bits&4)cmd->sidemove-=24;
  if(manual_bits&8)cmd->sidemove+=24;
  if(manual_bits&16)cmd->angleturn+=640;
  if(manual_bits&32)cmd->angleturn-=640;
  if(manual_bits&64)cmd->buttons|=BT_ATTACK;
  if(manual_bits&128)cmd->buttons|=BT_USE;
}
static double bearing(double x,double y,double angle){
  double v=atan2(y,x)*180.0/3.141592653589793-angle;
  while(v>180)v-=360;while(v< -180)v+=360;return v;
}
typedef struct {mobj_t *mo;double distance,bearing;} Seen;
static Seen seen[12];
static int ray_usable;
static double ray_distance;
static mobj_t *ray_player;
static boolean ray_visit(intercept_t *in){
  line_t *line=in->d.line;
  double distance=(double)in->frac/FRACUNIT*256;
  if(DB_IsUsableLine(line)&&!(line->flags&ML_SECRET)&&!P_PointOnLineSide(ray_player->x,ray_player->y,line)&&distance<=64)ray_usable=1;
  int blocked=!line->backsector||(line->flags&ML_BLOCKING);
  if(!blocked){P_LineOpening(line);blocked=openrange<ray_player->height||opentop-ray_player->z<ray_player->height||openbottom-ray_player->z>24*FRACUNIT;}
  if(blocked){ray_distance=distance;return false;}
  return true;
}
static void put_input(int i){
  Channel *c=&channels[i];
  put("%s{\"channel\":\"%s\",\"sequence\":%d,\"code\":%d,\"active\":%s,\"appliedTic\":%d,\"remainingMs\":%.2f,\"targetHeading\":",i?",":"",channel_names[i],c->seq,c->code,c->end==1?"true":"false",c->applied,fmax(0,c->end==1?c->until-emscripten_get_now():0));
  if(i==1&&c->code)put("%.4f",c->point_mode?point_heading(c):c->target);else put("null");
  put(",\"targetPoint\":");if(c->point_mode)put("{\"x\":%.3f,\"y\":%.3f}",c->point_x,c->point_y);else put("null");
  put(",\"progress\":%.3f,\"blockedTics\":%d,\"endReason\":\"%s\"}",c->progress,c->blocked_tics,end_names[c->end]);
}
void DB_Snapshot(void){
  double snapshot_start=emscripten_get_now();
  player_t *p=&players[consoleplayer];mobj_t *me=p->mo;
  if(!me)return;
  own_motion_x=last_motion_actor==me?((double)me->x-last_motion_x)/FRACUNIT:0;
  own_motion_y=last_motion_actor==me?((double)me->y-last_motion_y)/FRACUNIT:0;
  if(hypot(own_motion_x,own_motion_y)>128)own_motion_x=own_motion_y=0;
  last_motion_x=me->x;last_motion_y=me->y;last_motion_actor=me;
  if(measure_movement){
    Channel *c=&channels[0];double dx=((double)me->x-movement_x)/FRACUNIT,dy=((double)me->y-movement_y)/FRACUNIT;
    double forward=dx*movement_dx+dy*movement_dy;
    c->progress+=forward;
    // Allow initial acceleration, then terminate only actual failed displacement.
    // No rescue move, direction selection or tactical input is supplied locally.
    // Reversing momentum or sliding along a wall is not a stationary collision.
    if(c->ticks>=4)c->blocked_tics=forward<.25&&hypot(dx,dy)<.25?c->blocked_tics+1:0;
    if(c->blocked_tics>=3&&c->end==1){c->end=7;c->until=0;}
    measure_movement=0;
  }
  if(last_hp>=0&&p->health<last_hp)DB_Event(0,last_hp-p->health);
  if(p->health<=0&&!last_dead){DB_Event(2,0);db_release();}
  last_hp=p->health;last_dead=p->health<=0;
  double angle=(double)me->angle*360.0/4294967296.0;
  used=0;overflow=0;
  put("{\"schemaVersion\":4,\"engineEpisode\":%d,\"mapId\":\"E%dM%d\",\"gameTic\":%d,\"capturedAtMs\":%.3f,\"status\":\"%s\",",episode,gameepisode,gamemap,gametic,emscripten_get_now(),completed?"complete":p->health<=0?"dead":gamestate==GS_LEVEL?"playing":"loading");
  put("\"inputs\":[");for(int i=0;i<3;i++)put_input(i);put("],");
  put("\"player\":{\"health\":%d,\"armor\":%d,\"ammo\":[%d,%d,%d,%d],\"weapon\":\"%s\",\"ownedWeapons\":[",p->health,p->armorpoints,p->ammo[0],p->ammo[1],p->ammo[2],p->ammo[3],weapon_names[p->readyweapon]);
  int comma=0;for(int i=0;i<NUMWEAPONS;i++)if(p->weaponowned[i]){put("%s\"%s\"",comma?",":"",weapon_names[i]);comma=1;}
  put("],\"keys\":[");for(int i=0;i<NUMCARDS;i++)put("%s%s",i?",":"",p->cards[i]?"true":"false");
  put("],\"x\":%.3f,\"y\":%.3f,\"angle\":%.3f},\"objects\":[",(double)me->x/FRACUNIT,(double)me->y/FRACUNIT,angle);
  int total=0,count=0;
  if(gamestate==GS_LEVEL)for(thinker_t *th=thinkercap.next;th!=&thinkercap;th=th->next){
    if(th->function.acp1!=(actionf_p1)P_MobjThinker)continue;
    mobj_t *m=(mobj_t*)th;
    if(m==me||!((m->flags&MF_COUNTKILL&&m->health>0)||(m->flags&MF_SPECIAL)))continue;
    double dx=(double)m->x/FRACUNIT-(double)me->x/FRACUNIT,dy=(double)m->y/FRACUNIT-(double)me->y/FRACUNIT;
    double d=hypot(dx,dy),b=bearing(dx,dy,angle);
    if(d>1024||fabs(b)>45||!P_CheckSight(me,m))continue;
    total++;int pos=count;
    for(int j=0;j<count;j++)if(d<seen[j].distance||(d==seen[j].distance&&(uintptr_t)m<(uintptr_t)seen[j].mo)){pos=j;break;}
    if(pos<12){if(count<12)count++;for(int j=count-1;j>pos;j--)seen[j]=seen[j-1];seen[pos]=(Seen){m,d,b};}
  }
  for(int i=0;i<count;i++){Seen s=seen[i];put("%s{\"id\":%u,\"kind\":\"%s\",\"type\":\"%.4s\",\"distance\":%.2f,\"bearing\":%.2f}",i?",":"",(unsigned)(uintptr_t)s.mo,s.mo->flags&MF_COUNTKILL?"enemy":"item",sprnames[s.mo->sprite],s.distance,s.bearing);}
  put("],\"truncatedObjects\":%d,\"rays\":[",total-count);
  if(gamestate==GS_LEVEL){
    static int angles[]={-135,-90,-45,0,45,90,135,180};
    ray_player=me;
    for(int i=0;i<8;i++){
      double a=(angle+angles[i])*3.141592653589793/180;ray_usable=0;ray_distance=256;
      P_PathTraverse(me->x,me->y,me->x+(fixed_t)(cos(a)*256*FRACUNIT),me->y+(fixed_t)(sin(a)*256*FRACUNIT),PT_ADDLINES,ray_visit);
      double center_distance=ray_distance;int usable=ray_usable;double body_distance=center_distance;
      // The engine collides an axis-aligned player box, not a point. Probe its
      // four leading/corner paths without P_CheckPosition's pickup side effects.
      fixed_t radius=me->radius-FRACUNIT/16;
      for(int corner=0;corner<4;corner++){
        fixed_t sx=me->x+(corner&1?radius:-radius),sy=me->y+(corner&2?radius:-radius);ray_distance=256;
        P_PathTraverse(sx,sy,sx+(fixed_t)(cos(a)*256*FRACUNIT),sy+(fixed_t)(sin(a)*256*FRACUNIT),PT_ADDLINES,ray_visit);
        if(ray_distance<body_distance)body_distance=ray_distance;
      }
      put("%s{\"bearing\":%d,\"distance\":%.2f,\"bodyDistance\":%.2f,\"interaction\":\"%s\"}",i?",":"",angles[i],center_distance,body_distance,abs(angles[i])<=45&&usable?"usable":"unknown");
    }
  }
  put("],%s,\"events\":[",DB_Interactions(p));int first=sequence>32?sequence-32:0;
  for(int i=first;i<sequence;i++){Event e=events[i%32];put("%s{\"seq\":%d,\"tic\":%d,\"type\":\"%s\",\"value\":%d}",i>first?",":"",e.seq,e.tic,event_names[e.type],e.value);}
  put("]}");
  snapshot_cost=emscripten_get_now()-snapshot_start;
}
EMSCRIPTEN_KEEPALIVE const char *db_observation(void){return snapshot;}
