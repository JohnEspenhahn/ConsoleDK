import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import csv = require('./csv-parser');

export interface FailedRow {
    start: number;
    end: number;
}

type RowSizeExceededError = Error & {
    start: number;
    end: number;
};

export class S3StreamReader {

    private readonly s3: AWS.S3;

    private readonly batchSize = 5;
    private readonly maximumRecordSizeBytes = 400 * 1000;
    private readonly maxDurationSeconds = 60 * 8;

    constructor() {
        this.s3 = AWSXRay.captureAWSClient(new AWS.S3());
    }

    stream = async (bucket: string, key: string, startIndex: number, callback: (successBatch?: any[], failedBatch?: FailedRow[]) => Promise<void>): Promise<number | null> => {
        const start = Date.now();
        const metadata = await this.s3.headObject({ Bucket: bucket, Key: key }).promise();

        // TODO handle JSON
        if (metadata.ContentType !== "text/csv" && metadata.ContentType !== "text/csv; charset=utf-8") {
            throw new Error(`Unsupported ContentType ${metadata.ContentType}`);
        }

        return new Promise((resolve, reject) => {
            let successBatch: any[] = [];
            let failedBatch: FailedRow[] = [];
            let index = startIndex;

            let stream = this.s3.getObject({ Bucket: bucket, Key: key }).createReadStream();

            stream = stream
                .pipe(csv({
                    escape : '\\',
                    maxRowBytes : this.maximumRecordSizeBytes,
                    startAfter: startIndex,
                }));

            stream
                .on('data', async (row) => {
                    successBatch.push(row);

                    if (successBatch.length >= this.batchSize) {
                        console.log("Calling with: " + JSON.stringify(successBatch));
                        await callback(successBatch, undefined);
                        successBatch = [];
                    }

                    index += 1;

                    const elapsedTime = ((Date.now()) - start) / 1000;
                    if (elapsedTime > this.maxDurationSeconds) {
                        resolve(index);
                        stream.destroy();
                    }
                })
                .on('error', async (err) => {
                    if (err.hasOwnProperty("start") && err.hasOwnProperty("end")) {
                        // Is RowSizeExceededError
                        failedBatch.push({
                            start: (err as RowSizeExceededError).start,
                            end: (err as RowSizeExceededError).end
                        });

                        if (failedBatch.length >= this.batchSize) {
                            console.log("Calling with: " + JSON.stringify(failedBatch));
                            await callback(undefined, failedBatch);
                            failedBatch = [];
                        }

                        index += 1;
                    } else {
                        reject(err);
                    }
                })
                .on('end', async () => {
                    if (successBatch.length > 0) {
                        console.log("Calling with: " + JSON.stringify(successBatch));
                        await callback(successBatch, undefined);
                        successBatch = [];
                    }

                    if (failedBatch.length > 0) {
                        console.log("Calling with: " + JSON.stringify(failedBatch));
                        await callback(undefined, failedBatch);
                        failedBatch = [];
                    }

                    resolve(null);
                });
        });
    }

}