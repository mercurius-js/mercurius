#! /bin/bash

./node_modules/.bin/autocannon -c 100 -d 5 -p 10 --on-port '/graphql?query={add(x:2,y:2)}' -- node examples/basic.js
