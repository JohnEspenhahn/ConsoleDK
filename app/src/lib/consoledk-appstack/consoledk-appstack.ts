import * as cdk from 'monocdk';
import * as path from 'path';
import { ConsoleAssets, ConsoleAssetsProperties } from '../console-assets/console-assets';
import { Janitor } from '../janitor/janitor';

export class ConsoleDKAppStack extends cdk.Stack {
    consoleAssets: ConsoleAssets[];

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    // Common elements
    new Janitor(this, 'janitor');

    this.consoleAssets = [];
  }

  /**
   * 
   * @param consoleAssets Console resources
   */
  addConsoleAssets(consoleAssets: ConsoleAssetsProperties) {
      this.consoleAssets.push(new ConsoleAssets(this, consoleAssets.entry, consoleAssets));
  }

  async build() {
      const buildingAssets = this.consoleAssets.map(assets => assets.build());
      for await (let _assets of buildingAssets) { }
  }
  
}
