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

export type StreamReaderCallback = (successBatch?: any[], failedBatch?: FailedRow[]) => Promise<void>;

export class S3StreamReader {

    private readonly s3: AWS.S3;

    private readonly maximumRecordSizeBytes = 400 * 1000;

    constructor() {
        this.s3 = AWSXRay.captureAWSClient(new AWS.S3());
    }

    stream = async (bucket: string, key: string, startIndex: number, callback: StreamReaderCallback): Promise<number | null> => {
        const metadata = await this.s3.headObject({ Bucket: bucket, Key: key }).promise();

        // TODO handle JSON
        if (metadata.ContentType !== "text/csv" && metadata.ContentType !== "text/csv; charset=utf-8") {
            throw new Error(`Unsupported ContentType ${metadata.ContentType}`);
        }

        // TODO enforce maximum size based on 15 minute scan timeout

        const stream = this.s3.getObject({ Bucket: bucket, Key: key }).createReadStream();
        
        try {
            const nextStartAfterIndex = await this.processStream(stream, startIndex, callback);
            return nextStartAfterIndex;
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    private processStream(stream: Readable, startAfterIndex: number, callback: StreamReaderCallback): Promise<number | null> {
        return new Promise((_resolve, _reject) => {
            let stopFlag = false;

            function doStop() {
                stopFlag = true;
                stream.destroy();
            }

            const resolve = async (val: number | null) => {
                doStop();
                _resolve(val);
            };

            const reject = async (err: Error) => {
                doStop();
                _reject(err);
            };

            let successBatch: any[] = [];
            let failedBatch: FailedRow[] = [];
            let nextStartAfterIndex = -1; // Initial

            const batchSize = 1; // TODO increase to 5?
            const start = Date.now();
            const maxDurationSeconds = 60 * 8;

            stream.pipe(csv({
                    escape : '\\',
                    maxRowBytes : this.maximumRecordSizeBytes,
                    startAfter: startAfterIndex,
                }, async (data: any, err: Error, stop?: boolean) => {
                    // Check if already stopped
                    if (stopFlag) {
                        return;
                    }
                    
                    // Stop if stream ended, or elapsedTime exceeded
                    const elapsedTime = ((Date.now()) - start) / 1000;
                    if (stop) { // || elapsedTime > maxDurationSeconds
                        stop = true;
                        stopFlag = true;
                    }

                    // Handle event
                    if (data) {
                        console.log("Data: " + JSON.stringify(data));

                        // Data row may not be present when stopping
                        if (data.row) {
                            successBatch.push(data.row);
                            nextStartAfterIndex = data.lineNumber;
                        }

                        if (stop || successBatch.length >= batchSize) {
                            await callback(successBatch, undefined);
                            successBatch = [];

                            // TODO remove
                            stop = true;
                        }
                    } else if (err.hasOwnProperty("start") && err.hasOwnProperty("end")) {
                        failedBatch.push({
                            start: (err as RowSizeExceededError).start,
                            end: (err as RowSizeExceededError).end
                        });

                        try {
                            if (stop || failedBatch.length >= batchSize) {
                                await callback(undefined, failedBatch);
                                failedBatch = [];
                            }
                        } catch (innerErr) {
                            console.error(innerErr);
                            reject(innerErr);
                            return;
                        }
                    } else {
                        // Unexpected case
                        console.error(err);
                        reject(err);
                        return;
                    }

                    // Happy-path stop
                    if (stop) {
                        if (nextStartAfterIndex > startAfterIndex) {
                            // Potentially more data to process
                            resolve(nextStartAfterIndex);
                        } else {
                            // Done
                            resolve(null);
                        }
                    }
                }));
        });
    }

}