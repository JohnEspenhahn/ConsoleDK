import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { Parameters, S3IngestionMapping } from "./arguments";
import { parse, Mapping } from './mapping-parser';
import csv = require('./csv-parser');
import { DataTableWriter } from './data-table-writer';

type IndexRange = [number, number];

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

    stream = async (bucket: string, key: string, startIndex: number, callback: (successBatch?: any[], failedBatch?: IndexRange[]) => Promise<void>): Promise<number | null> => {
        const start = Date.now();
        const metadata = await this.s3.headObject({ Bucket: bucket, Key: key }).promise();
        if (metadata.ContentType !== "text/csv" && metadata.ContentType !== "text/csv; charset=utf-8") {
            throw new Error(`Unsupported ContentType ${metadata.ContentType}`);
        }

        let stream = this.s3.getObject({ Bucket: bucket, Key: key }).createReadStream();

        let successBatch: any[] = [];
        let failedBatch: IndexRange[] = [];
        let index = startIndex;

        // TODO handle JSON
        stream = stream
            .pipe(csv({
                escape : '\\',
                maxRowBytes : this.maximumRecordSizeBytes,
                startAfter: startIndex,
            }));

        return new Promise((resolve, reject) => {
            stream
                .on('data', async (row) => {
                    successBatch.push(row);

                    if (successBatch.length > this.batchSize) {
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
                        failedBatch.push([(err as RowSizeExceededError).start, (err as RowSizeExceededError).end]);

                        if (failedBatch.length > this.batchSize) {
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
                        await callback(successBatch, undefined);
                    }

                    if (failedBatch.length > 0) {
                        await callback(undefined, failedBatch);
                    }

                    resolve(null);
                });
        });
    }

}