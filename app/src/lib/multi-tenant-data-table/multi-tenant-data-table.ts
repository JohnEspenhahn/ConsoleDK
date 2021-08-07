import * as cdk from 'monocdk';
import { aws_dynamodb as ddb } from 'monocdk';

/**
 * Table with keys 
 *   PartitionKey="{CUSTOMER_ID}_{CUSTOMER_DATA_TABLE}_{DATA_TABLE_PARTITION_KEY}"
 *   SortKey="{DATA_TABLE_SORT_KEY}"
 */
export class MultiTenantDataTable extends cdk.Construct {
    private readonly table: ddb.Table;

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        this.table = new ddb.Table(this, 'Table', {
            partitionKey: {
                name: 'PartitionKey', type: ddb.AttributeType.STRING,
            },
            sortKey: {
                name: 'SortKey', type: ddb.AttributeType.STRING,
            },
        });
    }

    get tableName() {
        return this.table.tableName;
    }

}