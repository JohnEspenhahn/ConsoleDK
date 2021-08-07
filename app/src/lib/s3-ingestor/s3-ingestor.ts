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
} from "monocdk";
import { LongRunningLambda } from '../long-running-lambda/long-running-lambda';
import * as path from "path";
import { Parameters, S3PrefixVariable, SerializableS3IngestionMapping } from './code/arguments';

interface IngestionTarget {
    table: MultiTenantDataTable;
}

interface S3IngestionMapping {
    prefix: string;
    prefixVariables: S3PrefixVariable[];
    target: IngestionTarget;
}

export interface S3IngestorProps {
    mappings: S3IngestionMapping[];
    ingestionTimeout: cdk.Duration;
}

/**
 * 
 * Bucket -- notification --> SQS --> LongRunningLambda
 * 
 */
export class S3Ingestor extends cdk.Construct {
    public readonly deadLetterQueue: sqs.Queue;

    private readonly bucket: s3.Bucket;
    private readonly queue: sqs.Queue;
    private readonly lambda: LongRunningLambda;

    constructor(scope: cdk.Construct, id: string, props: S3IngestorProps) {
        super(scope, id);

        this.bucket = new s3.Bucket(this, 'bucket');
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

        const processor = new lambdajs.NodejsFunction(this, 'processor', {
            memorySize: 128,
            timeout: cdk.Duration.minutes(15),
            handler: 'main',
            entry: path.join(__dirname, '/code/s3-ingestor-lambda-entry.ts'),
            projectRoot: path.join(__dirname, '/code/'),
            depsLockFilePath: path.join(__dirname, '/code/package-lock.json'),
            environment: {
                [Parameters.MAPPINGS]: JSON.stringify(this.serializeMappings(props.mappings)),
            },
            tracing: lambda.Tracing.PASS_THROUGH,
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
            ],
        }));

        const alias = new lambda.Alias(this, 'alias', {
            aliasName: 'live',
            version: processor.currentVersion,
        });

        this.lambda = new LongRunningLambda(this, 'lambda', {
            processor: alias,
            timeout: props.ingestionTimeout,
            dlq: this.deadLetterQueue,
        });

        this.lambda.addEventSource(new eventsources.SqsEventSource(this.queue, {
            batchSize: 1,
        }));
    }

    private serializeMappings = (mappings: S3IngestionMapping[]): SerializableS3IngestionMapping[] => {
        return mappings.map(mapping => ({
            prefix: mapping.prefix,
            prefixVariables: mapping.prefixVariables,
            target: {
                tableName: mapping.target.table.tableName,
            },
        }));
    }

}