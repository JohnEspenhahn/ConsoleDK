#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'monocdk';
import { AppStack } from './stack/app-stack';


async function createApp() {
  const app = new cdk.App();

  const appStack = new AppStack(app, 'AppStack');

  await appStack.build();

  return app;
}

try {
  createApp();
} catch (e) {
  process.exitCode = 1;
}