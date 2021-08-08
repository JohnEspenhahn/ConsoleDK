import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { Parameters, S3IngestionMapping } from "./arguments";
import { parse, Mapping } from './mapping-parser';
import { DataTableWriter } from './data-table-writer';
import { S3StreamReader } from './s3-stream-reader';
import { v4 as uuidv4 } from 'uuid';


interface SQSMessage {
    body: string;
}

interface S3Message {
    s3: {
        bucket: {
            name: string,
        },
        object: {
            key: string,
            size: number,
        }
    }
}

/**
 * 
 * @param event SQSEvent + optional Next
 * @param context 
 * @param callback { ...SQSEvent } + optional Next
 */
export async function main(event: any, context: any, callback: any) {
    console.log(event);
    console.log(process.env[Parameters.MAPPINGS]);

    if (!event['Records']) {
        throw new Error("s3 ingestor lambda can only handle SQSEvents");
    } else if (event.Records.length !== 1) {
        throw new Error("s3 ingestor lambda can only handle one SQSEvent at a time");
    } else if (!process.env[Parameters.MAPPINGS]) {
        throw new Error("No mappings provided in envionrment");
    } else if (!process.env[Parameters.DDB_TABLE]) {
        throw new Error("No ddb table provided in environment");
    }

    const mappings: S3IngestionMapping[] = JSON.parse("" + process.env[Parameters.MAPPINGS]);

    let next: number | null = null;

    const sqsMsg: SQSMessage = event.Records[0];
    const sqsMsgBody = JSON.parse(sqsMsg.body);
    if (!sqsMsgBody['Records']) {
        throw new Error("s3 ingestor lambda can only handle SQSEvents that contain S3Events");
    } else if (sqsMsgBody.Records.length !== 1) {
        throw new Error("s3 ingestor lambda can only handle one S3Event at a time");
    }

    const s3Msg: S3Message = sqsMsgBody.Records[0];
    if (s3Msg.s3) {
        const bucket = s3Msg.s3.bucket.name;
        const key = s3Msg.s3.object.key;

        console.log(`s3://${bucket}/${key} after ${event['Next']}`);

        const mapping = parse(key, mappings);
        if (mapping) {
            const s3 = AWSXRay.captureAWSClient(new AWS.S3());
            next = await ingestObject(s3, bucket, key, event['Next'], mapping);

            if (!next) {
                console.log("Deleting...");
                await deleteObject(s3, bucket, key);
            }
        } else {
            console.log(`No mapping found for key ${key}`);
        }
    } else {
        console.log("s3 ingestor lambda got non-s3 message");
    }

    if (next) {
        console.log("Returning next: " + next);

        callback(null, {
            ...event,
            Next: next,
        });
    } else {
        console.log("Returning 200");

        callback(null, {
            StatusCode: 200,
            Nest: null,
        });
    }
}

function ingestionFailureHandlerFactory(s3: AWS.S3, sourceBucket: string, sourceKey: string) {
    return async function _ingestionFailureHandler(items: any[]) {
        console.log("Failed " + JSON.stringify(items));

        await s3.putObject({
            Bucket: sourceBucket,
            Key: `failed/${sourceKey}/${uuidv4()}`,
            Body: JSON.stringify(items),
        }).promise();
    }
}

async function ingestObject(s3: AWS.S3, bucket: string, key: string, next: number | undefined, mapping: Mapping): Promise<number | null> {
    const startIndex: number = next || 0;
    
    const stream = new S3StreamReader();
    const ingestionFailureHandler = ingestionFailureHandlerFactory(s3, bucket, key);

    const ddbTable =  "" + process.env[Parameters.DDB_TABLE];
    const ddbPartitionTable = "" + process.env[Parameters.DDB_PARTITION_TABLE];
    const writer = new DataTableWriter(ddbTable, ddbPartitionTable, mapping, ingestionFailureHandler);

    try {
        const resp = await stream.stream(bucket, key, startIndex, async (successBatch, failedBatch) => {
            if (successBatch) {
                await writer.batchPut(successBatch);
            }

            if (failedBatch) {
                await ingestionFailureHandler(failedBatch);
            }
        });

        return resp;
    } catch (e) {
        throw e;
    }
}

async function deleteObject(s3: AWS.S3, bucket: string, key: string) {
    await s3.deleteObject({
        Bucket: bucket,
        Key: key,
    }).promise();
}
