#!/bin/sh
apk add --no-cache curl

echo "Waiting for Metabase to be ready..."
until curl -s -f http://site-metabase:3000/api/health > /dev/null; do
  echo -n "."
  sleep 5
done
echo "Metabase is up!"

SETUP_TOKEN=$(curl -s http://site-metabase:3000/api/session/properties | grep -o '"setup-token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SETUP_TOKEN" ] || [ "$SETUP_TOKEN" = "null" ]; then
  echo "Metabase already setup. Skipping."
  exit 0
fi

echo "Starting setup with token: $SETUP_TOKEN"

curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "token": "'"$SETUP_TOKEN"'",
    "user": {
      "email": "'"$MB_ADMIN_EMAIL"'",
      "first_name": "'"$MB_ADMIN_FNAME"'",
      "last_name": "'"$MB_ADMIN_LNAME"'",
      "password": "'"$MB_ADMIN_PASS"'"
    },
    "prefs": {
      "site_name": "My Dashboard",
      "allow_tracking": false
    },
    "database": {
      "name": "Primary DB",
      "engine": "postgres",
      "details": {
        "host": "db",
        "port": 5432,
        "dbname": "'"$POSTGRES_DB"'",
        "user": "'"$POSTGRES_USER"'",
        "password": "'"$POSTGRES_PASSWORD"'"
      }
    }
  }' \
  http://site-metabase:3000/api/setup

echo "Metabase setup complete!"
