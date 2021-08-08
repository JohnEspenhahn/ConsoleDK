import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import csv = require('./csv-parser');
import { Writable, Readable } from "stream";

export interface FailedRow {
    start: number;
    end: number;
}

type RowSizeExceededError = Error & {
    start: number;
    end: number;
};

class CallbackWriter extends Writable {

    private readonly batchSize = 5;
    private readonly maxDurationSeconds = 60 * 8;
    private readonly start = Date.now();

    private readonly source: Readable;
    private readonly resolve: (value: number) => void;
    private readonly callback: (successBatch?: any[], failedBatch?: FailedRow[]) => Promise<void>;

    private index: number;
    private successBatch: any[] = [];

    constructor(
        startIndex: number, 
        callback: (successBatch?: any[], failedBatch?: FailedRow[]) => Promise<void>, 
        source: Readable, 
        resolve: (value: number) => void
    ) {
        super({
            highWaterMark: 1,
        });

        this.index = startIndex;
        this.callback = callback;
        this.source = source;
        this.resolve = resolve;
    }

    _write = async (item: any, encoding: string, callback: () => void) => {
        this.source.pause();

        try {
            this.successBatch.push(item.row);
            this.index = item.lineNumber;

            if (this.successBatch.length >= this.batchSize) {
                console.log("Calling with: " + JSON.stringify(this.successBatch));
                await this.callback(this.successBatch, undefined);
                this.successBatch.length = 0;
            }

            const elapsedTime = ((Date.now()) - this.start) / 1000;
            if (elapsedTime > this.maxDurationSeconds) {
                this.resolve(this.index);
                this.source.destroy();
            }
        } finally {
            this.source.resume();
            callback();
        }
    }

    _final = async (callback: () => void) => {
        if (this.successBatch.length > 0) {
            await this.callback(this.successBatch, undefined);
        }

        callback();
    }

    _destroy(err: any, cb: (err: Error | null) => void) {
        cb(null)
    }
}

export class S3StreamReader {

    private readonly s3: AWS.S3;

    private readonly maximumRecordSizeBytes = 400 * 1000;

    constructor() {
        this.s3 = AWSXRay.captureAWSClient(new AWS.S3());
    }

    stream = async (bucket: string, key: string, startIndex: number, callback: (successBatch?: any[], failedBatch?: FailedRow[]) => Promise<void>): Promise<number | null> => {
        const metadata = await this.s3.headObject({ Bucket: bucket, Key: key }).promise();

        // TODO handle JSON
        if (metadata.ContentType !== "text/csv" && metadata.ContentType !== "text/csv; charset=utf-8") {
            throw new Error(`Unsupported ContentType ${metadata.ContentType}`);
        }

        return new Promise((resolve, reject) => {
            let successBatch: any[] = [];
            let failedBatch: FailedRow[] = [];
            let index = startIndex;

            const batchSize = 5;
            const start = Date.now();
            const maxDurationSeconds = 60 * 8;

            const stream = this.s3.getObject({ Bucket: bucket, Key: key }).createReadStream();
            stream.pipe(csv({
                    escape : '\\',
                    maxRowBytes : this.maximumRecordSizeBytes,
                    startAfter: startIndex,
                }, async (data: any, err: Error) => {
                    if (data) {
                        successBatch.push(data.row);
                        index = data.lineNumber;

                        if (successBatch.length >= batchSize) {
                            await callback(successBatch, undefined);
                            successBatch = [];
                        }
                    } else if (err.hasOwnProperty("start") && err.hasOwnProperty("end")) {
                        // TODO this callback may get overwhelmed 
                        failedBatch.push({
                            start: (err as RowSizeExceededError).start,
                            end: (err as RowSizeExceededError).end
                        });

                        if (failedBatch.length >= batchSize) {
                            await callback(undefined, failedBatch);
                            failedBatch = [];
                        }
                    } else {
                        reject(err);
                        return;
                    }

                    const elapsedTime = ((Date.now()) - start) / 1000;
                    if (elapsedTime > maxDurationSeconds) {
                        console.log("Duration exceeded");
                        resolve(index);
                        stream.destroy();
                    }
                }))
                .on('end', async () => {
                    if (successBatch.length > 0) {
                        await callback(successBatch, undefined);
                        successBatch = [];
                    }

                    if (failedBatch.length > 0) {
                        await callback(undefined, failedBatch);
                        failedBatch = [];
                    }

                    resolve(null);
                });
        });
    }

}