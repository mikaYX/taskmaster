#!/bin/bash
BASE_URL="http://localhost:3000/api"
AUTH_URL="$BASE_URL/auth/login"
BACKUP_URL="$BASE_URL/backup"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting Async Backup Verification...${NC}"

# 1. Login to get Token
# 1. Login to get Token
echo "Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST $AUTH_URL -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}')
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Login failed. Check server status.${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi
echo "Token received."

# 2. Trigger Backup (Create System Snapshot)
echo "Triggering Async Backup..."
START=$(date +%s%N)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKUP_URL/system" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"type":"DB"}')
END=$(date +%s%N)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Response Code: $HTTP_CODE"
echo "Response Body: $BODY"

DURATION=$((($END - $START) / 1000000))
echo "Duration: ${DURATION}ms"

if [ "$HTTP_CODE" -ne 202 ]; then
    echo -e "${RED}Expected 202 Accepted, got $HTTP_CODE${NC}"
    exit 1
fi

if [ "$DURATION" -gt 500 ]; then
    echo -e "${RED}Warning: Request took longer than 500ms ($DURATION ms)${NC}"
else
    echo -e "${GREEN}Performance constraint met (<500ms).${NC}"
fi

JOB_ID=$(echo "$BODY" | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)
if [ -z "$JOB_ID" ]; then
    echo -e "${RED}No Job ID returned.${NC}"
    exit 1
fi
echo "Job ID: $JOB_ID"

# 3. Poll Status
echo "Polling Status..."
STATUS=""
while [ "$STATUS" != "completed" ] && [ "$STATUS" != "failed" ]; do
    sleep 1
    STATUS_RES=$(curl -s -X GET "$BACKUP_URL/status/$JOB_ID" -H "Authorization: Bearer $TOKEN")
    STATUS=$(echo "$STATUS_RES" | grep -o '"state":"[^"]*' | cut -d'"' -f4)
    echo "Current Status: $STATUS"
done

if [ "$STATUS" == "failed" ]; then
    echo -e "${RED}Job Failed.${NC}"
    echo "$STATUS_RES"
    exit 1
fi

echo -e "${GREEN}Job Completed Successfully.${NC}"
RESULT=$(echo "$STATUS_RES" | grep -o '"result":{[^}]*}')
echo "Result: $RESULT"

echo -e "${GREEN}Async Verification Passed!${NC}"
