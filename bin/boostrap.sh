#!/bin/bash

full_path=$(realpath $0)
dir_path=$(dirname $full_path)
. $dir_path/env.sh

cdk bootstrap aws://$ACCOUNT_ID/$REGION