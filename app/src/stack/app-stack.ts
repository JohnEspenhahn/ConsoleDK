import * as cdk from 'monocdk';
import { Api } from '../lib/api/api';
import { ConsoleDKAppStack } from '../lib/consoledk-appstack/consoledk-appstack';
import { MultiTenantDataTable } from '../lib/multi-tenant-data-table/multi-tenant-data-table';
import { S3Ingestor } from '../lib/s3-ingestor/s3-ingestor';

export class AppStack extends ConsoleDKAppStack {

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const dataTable = new MultiTenantDataTable(this, 'table');
    const s3Ingestor = new S3Ingestor(this, 'ingestor', {
      ingestionTimeout: cdk.Duration.hours(2),
      mappings: [
        {
          prefix: "{Partition}/",
          prefixVariables: [
            {
              name: "Partition",
              type: "PARTITION_KEY",
            },
          ],
          columnVariables: [],
        },
      ],
      target: {
        table: dataTable,
      },
    });

    const api = new Api(this, 'api', {
      lambdaRoutes: [
        {
          method: 'GET',
          path: 'query',
          handler: dataTable.queryHandler,
        },
      ],
    });

    this.addConsoleAssets({
      entry: "console",
      bucketName: `944551238448-console-assets`,
    });
  }
  
}
