import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { createTypeToVariableLookup, getColumnMappingForRow, Mapping, TypeToVariableLookup } from './mapping-parser';
import { v4 as uuidv4 } from 'uuid';

export class DataTableWriter {
    private readonly ddb: AWS.DynamoDB;
    private readonly ddbTable: string;
    private readonly ddbPartitionTable: string;

    private readonly keyMapping: Mapping;
    private readonly columnTypeLookup: TypeToVariableLookup;

    private readonly failureHandler: (items: any[]) => Promise<void>;

    constructor(ddbTable: string, ddbPartitionTable: string, keyMapping: Mapping, failureHandler: (items: any[]) => Promise<void>) {
        this.ddb = AWSXRay.captureAWSClient(new AWS.DynamoDB());
        this.ddbTable = ddbTable;
        this.ddbPartitionTable = ddbPartitionTable;
        this.keyMapping = keyMapping;

        this.columnTypeLookup = createTypeToVariableLookup(keyMapping.columnVariables);

        this.failureHandler = failureHandler;
    }

    batchPut = async (batch: any[]) => {
        const MAX_BATCH_SIZE = 10;
        if (batch.length > MAX_BATCH_SIZE) {
            throw new Error(`Batch too large. ${batch.length} > ${MAX_BATCH_SIZE}`)
        }

        const tableRequests = [];
        const partitions: { [customerIdDataTable: string]: Set<string> } = {};

        for (const row of batch) {
            const columnMapping = getColumnMappingForRow(row, this.columnTypeLookup);

            const customerIdDataTable = `${this.keyMapping.customerId}_${this.keyMapping.dataTableName}`;
            const partition = this.keyMapping.partitionKeyPrefix +  (columnMapping.partitionKeySuffix || "");

            tableRequests.push({
                PutRequest: { 
                    Item: AWS.DynamoDB.Converter.marshall({
                        ...row,
                        ...this.keyMapping.columns,
                        PartitionKey: `${customerIdDataTable}_${partition}`,
                        SortKey: this.keyMapping.sortKey || columnMapping.sortKey || uuidv4()   
                    }),
                },
            });

            if (!(customerIdDataTable in partitions)) {
                partitions[customerIdDataTable] = new Set();
            }

            partitions[customerIdDataTable].add(partition);
        }

        const partitionRequests = [];
        for (const customerIdDataTable in partitions) {
            for (const partition of partitions[customerIdDataTable]) {
                partitionRequests.push({
                    PutRequest: { 
                        Item: AWS.DynamoDB.Converter.marshall({
                            CustomerIdDataTable: customerIdDataTable,
                            Partition: partition,
                        }),
                    },
                });
            }
        }

        const request = {
            RequestItems: {
                [this.ddbTable]: tableRequests,
                [this.ddbPartitionTable]: partitionRequests,
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