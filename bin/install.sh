#!/bin/bash

#
# Usage: from package root, run ./bin/install.sh
#

npm install -g aws-cdk
npm install -g constructs
npm install -g typescript
npm install -g ts-node
npm install -g expo-cli
npm install -g recursive-install

cd ./app
npm-recursive-install