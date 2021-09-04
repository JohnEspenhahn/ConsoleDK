import * as cdk from 'monocdk';
import { 
    aws_dynamodb as ddb ,
    aws_s3 as s3,
    aws_lambda_nodejs as lambdajs,
    aws_lambda as lambda,
    aws_iam as iam,
    aws_logs as logs,
} from 'monocdk';
import * as path from "path";
import { Parameters } from './code/arguments';

export interface MultiTenantDataTableProps {
    name: string;
}

/**
 * Table with keys 
 *   PartitionKey="{CUSTOMER_ID}_{DATA_TABLE_PARTITION_KEY}"
 *   SortKey="{DATA_TABLE_SORT_KEY}"
 */
export class MultiTenantDataTable extends cdk.Construct {
    private readonly table: ddb.Table;
    private readonly queryResults: s3.Bucket;
    private readonly alias: lambda.Alias;

    private readonly props: MultiTenantDataTableProps;

    constructor(scope: cdk.Construct, id: string, props: MultiTenantDataTableProps) {
        super(scope, id);
        this.props = props;

        if (props.name.indexOf("_") >= 0 || props.name.indexOf("/") >= 0) {
            throw new Error("Table name cannot include _ or /");
        }

        this.table = new ddb.Table(this, 'Table', {
            partitionKey: {
                name: 'PartitionKey', type: ddb.AttributeType.STRING,
            },
            sortKey: {
                name: 'SortKey', type: ddb.AttributeType.STRING,
            },
            billingMode: ddb.BillingMode.PAY_PER_REQUEST,
            tableName: props.name,
        });

        this.queryResults = new s3.Bucket(this, 'QueryResults');
        this.queryResults.addLifecycleRule({
            expiration: cdk.Duration.days(1),
        });

        // Query endpoint
        const queryHandler = new lambdajs.NodejsFunction(this, 'Query', {
            memorySize: 256,
            timeout: cdk.Duration.seconds(30),
            handler: 'main',
            entry: path.join(__dirname, '/code/query-lambda-entry.ts'),
            projectRoot: path.join(__dirname, '/code/'),
            depsLockFilePath: path.join(__dirname, '/code/package-lock.json'),
            environment: {
                [Parameters.DDB_TABLE]: this.table.tableName,
            },
            tracing: lambda.Tracing.PASS_THROUGH,
            logRetention: logs.RetentionDays.THREE_MONTHS,
        });
        queryHandler.role?.attachInlinePolicy(new iam.Policy(this, 'entrypolicy', {
            statements: [
                new iam.PolicyStatement({
                    actions: [
                        "dynamodb:ExecuteStatement",
                    ],
                    resources: this.arns,
                })
            ],
        }));

        this.alias = new lambda.Alias(this, 'alias', {
            aliasName: 'live',
            version: queryHandler.currentVersion,
        });
    }

    get queryHandler() {
        return this.alias;
    }

    get tableName() {
        return this.props.name;
    }

    get tableArn() {
        return this.table.tableArn;
    }

    get arns() {
        return [
            this.tableArn,
            `${this.tableArn}/index/*`,
        ]
    }

}