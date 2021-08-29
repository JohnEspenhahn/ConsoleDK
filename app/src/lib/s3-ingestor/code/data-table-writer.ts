import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { createTypeToVariableLookup, getColumnMappingForRow, Mapping, TypeToVariableLookup } from './mapping-parser';
import { v4 as uuidv4 } from 'uuid';

export class DataTableWriter {
    private readonly ddb: AWS.DynamoDB;
    private readonly ddbTable: string;

    private readonly keyMapping: Mapping;
    private readonly columnTypeLookup: TypeToVariableLookup;

    private readonly failureHandler: (items: any[]) => Promise<void>;

    constructor(ddbTable: string, keyMapping: Mapping, failureHandler: (items: any[]) => Promise<void>) {
        this.ddb = AWSXRay.captureAWSClient(new AWS.DynamoDB());
        this.ddbTable = ddbTable;
        this.keyMapping = keyMapping;

        this.columnTypeLookup = createTypeToVariableLookup(keyMapping.columnVariables);

        this.failureHandler = failureHandler;
    }

    batchPut = async (batch: any[]) => {
        if (batch.length == 0) {
            return;
        }

        const MAX_BATCH_SIZE = 10;
        if (batch.length > MAX_BATCH_SIZE) {
            throw new Error(`Batch too large. ${batch.length} > ${MAX_BATCH_SIZE}`)
        }

        const tableRequests = [];
        const partitions: { [customerId: string]: Set<string> } = {};

        for (const row of batch) {
            const columnMapping = getColumnMappingForRow(row, this.columnTypeLookup);

            const partition = this.keyMapping.partitionKeyPrefix +  (columnMapping.partitionKeySuffix || "");

            tableRequests.push({
                PutRequest: { 
                    Item: AWS.DynamoDB.Converter.marshall({
                        ...row,
                        ...this.keyMapping.columns,
                        PartitionKey: `${this.keyMapping.customerId}_${partition}`,
                        SortKey: this.keyMapping.sortKey || columnMapping.sortKey || uuidv4() // TODO remove uuidv4()
                    }),
                },
            });

            if (!(this.keyMapping.customerId in partitions)) {
                partitions[this.keyMapping.customerId] = new Set();
            }

            partitions[this.keyMapping.customerId].add(partition);
        }

        const request = {
            RequestItems: {
                [this.ddbTable]: tableRequests,
            },
        };

        console.log(JSON.stringify(request));

        let resp;
        try {
            resp = await this.ddb.batchWriteItem(request).promise();
        } catch (e) {
            await this.sendToFailedQueue(request.RequestItems[this.ddbTable]);

            throw e;
        }
    
        if (resp.UnprocessedItems && resp.UnprocessedItems[this.ddbTable]) {
            await this.sendToFailedQueue(resp.UnprocessedItems[this.ddbTable].map(requestItem => {
                if (requestItem.PutRequest) {
                    return AWS.DynamoDB.Converter.unmarshall(requestItem.PutRequest.Item);
                } else {
                    return null;
                }
            }));
        }
    }

    sendToFailedQueue = async (items: any[]) => {
        await this.failureHandler(items);
    }
}