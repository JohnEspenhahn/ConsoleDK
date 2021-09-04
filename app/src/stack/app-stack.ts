import * as cdk from 'monocdk';
import { Api } from '../lib/api/api';
import { ConsoleDKAppStack } from '../lib/consoledk-appstack/consoledk-appstack';
import { MultiTenantDataTable } from '../lib/multi-tenant-data-table/multi-tenant-data-table';
import { S3Ingestor } from '../lib/s3-ingestor/s3-ingestor';

export class AppStack extends ConsoleDKAppStack {

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const invoicesTable = new MultiTenantDataTable(this, 'table', {
      name: "Invoice",
    });

    const consoleBucketName = 'consoledk-console-bucket';
    const ingestionBucketName = 'consoledk-ingestion-bucket';

    const ingestionBucket = new cdk.aws_s3.Bucket(this, 'IngestionBucket', {
      bucketName: ingestionBucketName,
    });

    const s3Ingestor = new S3Ingestor(this, 'ingestor', {
      bucket: ingestionBucket,
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
        table: invoicesTable,
      },
    });

    const api = new Api(this, 'api', {
      lambdaRoutes: [
        {
          method: 'GET',
          path: `query/${invoicesTable.tableName}`,
          handler: invoicesTable.queryHandler,
        },
      ],
      s3Routes: [
        {
          method: 'GET',
          bucketName: consoleBucketName,
          key: 'index.html'
        }
      ]
    });

    this.addConsoleAssets({
      entry: "console",
      bucketName: consoleBucketName,
      metadata: {
        endpoint: api.endpoint,
      },
    });
  }
  
}
