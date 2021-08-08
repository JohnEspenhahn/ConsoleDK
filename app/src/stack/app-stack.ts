import * as cdk from 'monocdk';
import * as path from 'path';
import { ConsoleAssets } from '../lib/console-assets/console-assets';
import { Janitor } from '../lib/janitor/janitor';
import { MultiTenantDataTable } from '../lib/multi-tenant-data-table/multi-tenant-data-table';
import { S3Ingestor } from '../lib/s3-ingestor/s3-ingestor';

export class AppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const janitor = new Janitor(this, 'janitor');
    const dataTable = new MultiTenantDataTable(this, 'table');
    const s3Ingestor = new S3Ingestor(this, 'ingestor', {
      ingestionTimeout: cdk.Duration.hours(2),
      mappings: [
        {
          prefix: "{Table}/{Partition}/",
          prefixVariables: [
            {
              name: "Table",
              type: "TABLE",
              in: ["test-table"]
            },
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

    new ConsoleAssets(this, 'console', {
      entry: path.resolve(__dirname, "../console.tsx"),
    });
  }
}
