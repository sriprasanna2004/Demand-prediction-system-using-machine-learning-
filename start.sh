#!/bin/bash
cd "$(dirname "$0")/ai demand/ai demand/backend" 2>/dev/null || cd "$(dirname "$0")/backend" 2>/dev/null || true
node src/server.js
