#!/bin/bash
source ~/.nvm/nvm.sh
nvm use default
cd /home/user/taskmaster/backend
npx prisma migrate dev --name task_delegations_expand --create-only
