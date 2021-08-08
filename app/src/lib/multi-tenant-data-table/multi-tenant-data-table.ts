import * as cdk from 'monocdk';
import { aws_dynamodb as ddb } from 'monocdk';

/**
 * Table with keys 
 *   PartitionKey="{CUSTOMER_ID}_{CUSTOMER_DATA_TABLE}_{DATA_TABLE_PARTITION_KEY}"
 *   SortKey="{DATA_TABLE_SORT_KEY}"
 */
export class MultiTenantDataTable extends cdk.Construct {
    private readonly table: ddb.Table;
    private readonly partitions: ddb.Table;

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        this.table = new ddb.Table(this, 'Table', {
            partitionKey: {
                name: 'PartitionKey', type: ddb.AttributeType.STRING,
            },
            sortKey: {
                name: 'SortKey', type: ddb.AttributeType.STRING,
            },
            billingMode: ddb.BillingMode.PAY_PER_REQUEST,
        });

        this.partitions = new ddb.Table(this, 'Partitions', {
            partitionKey: {
                name: 'CustomerIdDataTable', type: ddb.AttributeType.STRING,
            },
            sortKey: {
                name: 'Partition', type: ddb.AttributeType.STRING,
            },
            billingMode: ddb.BillingMode.PAY_PER_REQUEST,
        });
    }

    get tableName() {
        return this.table.tableName;
    }

    get tableArn() {
        return this.table.tableArn;
    }

    get partitionTableName() {
        return this.partitions.tableName;
    }

    get partitionTableArn() {
        return this.partitions.tableArn;
    }

    get arns() {
        return [
            this.tableArn,
            `${this.tableArn}/index/*`,
            this.partitionTableArn,
            `${this.partitionTableArn}/index/*`,
        ]
    }

}