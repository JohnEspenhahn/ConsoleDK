import * as cdk from 'monocdk';
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
            },
            {
              name: "Partition",
              type: "PARTITION_KEY",
            },
          ],
          target: {
            table: dataTable,
          },
        },
      ],
    });
  }
}
