#!/bin/bash
set -e
pnpm install --frozen-lockfile
if [ -n "$DATABASE_URL" ]; then
  pnpm --filter db push
fi
