#!/bin/bash

export ACCOUNT_ID=944551238448
export REGION=$(aws configure get region)
export STAGE=alpha

export DEPLOYMENT_GROUP="$ACCOUNT_ID_$REGION_$STAGE"

echo "Env: $ACCOUNT_ID $REGION $STAGE"