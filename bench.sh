#! /bin/bash

# from https://github.com/mercurius-js/auth/tree/main/bench

echo '=============================='
echo '= Normal Mode                ='
echo '=============================='
npx concurrently --raw -k \
  "node ./bench/normal-without-auth.js" \
  "npx wait-on tcp:3000 && node ./bench/normal-bench.js"

echo '==============================='
echo '= Gateway Mode                ='
echo '==============================='
npx concurrently --raw -k \
  "node ./bench/gateway-service-1.js" \
  "node ./bench/gateway-service-2.js" \
  "npx wait-on tcp:3001 tcp:3002 && node ./bench/gateway-without-auth.js" \
  "npx wait-on tcp:3000 && node ./bench/gateway-bench.js"
