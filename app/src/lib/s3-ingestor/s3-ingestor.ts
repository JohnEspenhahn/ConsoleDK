import * as cdk from 'monocdk';
import { MultiTenantDataTable } from '../multi-tenant-data-table/multi-tenant-data-table';
import { 
    aws_s3 as s3, 
    aws_sqs as sqs, 
    aws_s3_notifications as s3notify,
    aws_lambda_nodejs as lambdajs,
    aws_lambda as lambda,
    aws_lambda_event_sources as eventsources,
    aws_iam as iam,
    aws_logs as logs,
} from "monocdk";
import { LongRunningLambda } from '../long-running-lambda/long-running-lambda';
import * as path from "path";
import { ColumnVariable, Parameters, S3PrefixVariable } from './code/arguments';
import { validate } from './code/mapping-parser';
import { IAM_CUSTOMER_ID } from '../simpleauth/constants';

interface S3IngestionMapping {
    prefix: string;
    prefixVariables: S3PrefixVariable[];
    columnVariables: ColumnVariable[];
}

export interface S3IngestorProps {
    mappings: S3IngestionMapping[];
    ingestionTimeout?: cdk.Duration;
    target: MultiTenantDataTable;
    bucket?: s3.Bucket;
}

/**
 * 
 * Bucket -- notification --> SQS --> LongRunningLambda
 * 
 * When file uploaded to path /{IamCustomerId}/{PublicTableName}/{Mapping} inserted into ingestion target
 * 
 */
export class S3Ingestor extends cdk.Construct {
    public readonly deadLetterQueue: sqs.Queue;

    readonly bucket: s3.Bucket;
    private readonly queue: sqs.Queue;
    private readonly lambda: LongRunningLambda;

    private readonly props: S3IngestorProps;

    constructor(scope: cdk.Construct, id: string, props: S3IngestorProps) {
        super(scope, id);

        this.props = props;
        this.bucket = props.bucket ?? new s3.Bucket(this, 'bucket');
        this.deadLetterQueue = new sqs.Queue(this, 'dlq');

        const KICKOFF_RETRIES = 1;
        this.queue = new sqs.Queue(this, 'queue', {
            visibilityTimeout: cdk.Duration.minutes(KICKOFF_RETRIES + 1),
            deadLetterQueue: {
                queue: this.deadLetterQueue,
                maxReceiveCount: KICKOFF_RETRIES,
            },
        });

        this.bucket.addObjectCreatedNotification(new s3notify.SqsDestination(this.queue));

        validate(props.mappings);

        const processor = new lambdajs.NodejsFunction(this, 'processor', {
            memorySize: 3000,
            timeout: cdk.Duration.minutes(15),
            handler: 'main',
            entry: path.join(__dirname, '/code/s3-ingestor-lambda-entry.ts'),
            projectRoot: path.join(__dirname, '/code/'),
            depsLockFilePath: path.join(__dirname, '/code/package-lock.json'),
            environment: {
                [Parameters.MAPPINGS]: JSON.stringify(props.mappings),
                [Parameters.DDB_TABLE]: props.target.tableName,
                [Parameters.PARTITION_KEY]: props.target.partitionKey,
            },
            tracing: lambda.Tracing.PASS_THROUGH,
            logRetention: logs.RetentionDays.THREE_MONTHS,
        });
        processor.role?.attachInlinePolicy(new iam.Policy(this, 'entrypolicy', {
            statements: [
                new iam.PolicyStatement({
                    actions: [
                        "s3:Get*",
                        "s3:Delete*",
                    ],
                    resources: [
                        `${this.bucket.bucketArn}/*`,
                    ],
                }),
                new iam.PolicyStatement({
                    actions: [
                        "s3:PutObject"
                    ],
                    resources: [
                        `${this.bucket.bucketArn}/failed/*`,
                    ],
                }),
                new iam.PolicyStatement({
                    actions: [
                        "dynamodb:BatchWriteItem",
                    ],
                    resources: props.target.arns,
                })
            ],
        }));

        const alias = new lambda.Alias(this, 'alias', {
            aliasName: 'live',
            version: processor.currentVersion,
        });

        this.lambda = new LongRunningLambda(this, 'lambda', {
            processor: alias,
            timeout: props.ingestionTimeout ?? cdk.Duration.hours(2),
            dlq: this.deadLetterQueue,
        });

        this.lambda.addEventSource(new eventsources.SqsEventSource(this.queue, {
            batchSize: 1,
        }));
    }

}