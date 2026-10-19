#ifndef DECISION_INTERACTIONS_H
#define DECISION_INTERACTIONS_H
#include "p_local.h"
int DB_IsUsableLine(line_t *line);
int DB_CanUse(player_t *player);
void DB_ResetInteractions(void);
void DB_UseBegin(void);
int DB_UseLine(mobj_t *thing, line_t *line, int side);
const char *DB_Interactions(player_t *player);
#endif
