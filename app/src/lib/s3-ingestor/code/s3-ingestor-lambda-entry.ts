import * as AWS from 'aws-sdk';
import { Parameters, SerializableS3IngestionMapping } from "./arguments";

interface S3SQSMessage {
    "s3": {
        "bucket": {
            "name": string,
        },
        "object": {
            "key": string,
            "size": number,
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
        throw new Error("s3 ingestor lambda can only handle one file at a time");
    } else if (!process.env[Parameters.MAPPINGS]) {
        throw new Error("No mappings provided in envionrment");
    }

    const mappings: SerializableS3IngestionMapping[] = JSON.parse("" + process.env[Parameters.MAPPINGS]);

    let next: string | null = null;

    const msg: S3SQSMessage = event.Records[0];
    if (msg.s3) {
        console.log(`s3://${msg.s3.bucket.name}/${msg.s3.object.key} after ${event['Next']}`);

        next = await ingestObject(msg.s3.bucket.name, msg.s3.object.key, event['Next'], mappings);

        if (!next) {
            deleteObject(msg.s3.bucket.name, msg.s3.object.key);
        }
    } else {
        console.log("s3 ingestor lambda got non-s3 message");
    }

    if (next) {
        callback(null, {
            ...event,
            Next: next,
        });
    } else {
        callback(null, {
            StatusCode: 200,
        });
    }
}

async function ingestObject(bucket: string, key: string, next: string | undefined, mappings: SerializableS3IngestionMapping[]): Promise<string | null> {
    let startIndex: number = 0;
    if (next) {
        startIndex = parseInt(next);
    }

    // TODO upload to DDB

    return null;
}

async function deleteObject(bucket: string, key: string) {
    const s3 = new AWS.S3();
    await s3.deleteObject({
        Bucket: bucket,
        Key: key,
    }).promise();
}
