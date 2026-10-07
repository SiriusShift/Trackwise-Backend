#!/bin/sh
npx prisma migrate deploy
exec node server.js