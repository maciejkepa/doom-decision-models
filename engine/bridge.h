#ifndef DECISION_BRIDGE_H
#define DECISION_BRIDGE_H
#include "d_ticcmd.h"
void DB_Input(ticcmd_t *cmd);
void DB_Snapshot(void);
void DB_Event(int type, int value);
void DB_RenderCapture(int before);
void DB_RenderReset(void);
void DB_RenderAlpha(double alpha);
void DB_RenderView(int *x,int *y,int *z,unsigned int *angle);
#endif
