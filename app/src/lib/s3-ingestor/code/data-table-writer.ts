import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { createTypeToVariableLookup, getColumnMappingForRow, Mapping, TypeToVariableLookup } from './mapping-parser';

export class DataTableWriter {
    private readonly ddb: AWS.DynamoDB;
    private readonly ddbTable: string;

    private readonly keyMapping: Mapping;
    private readonly columnTypeLookup: TypeToVariableLookup;

    constructor(ddbTable: string, keyMapping: Mapping) {
        this.ddb = AWSXRay.captureAWSClient(new AWS.DynamoDB());
        this.ddbTable = ddbTable;
        this.keyMapping = keyMapping;

        this.columnTypeLookup = createTypeToVariableLookup(keyMapping.columnVariables);
    }

    batchPut = async (batch: any[]) => {
        const requests = batch.map(row => {
            const columnMapping = getColumnMappingForRow(row, this.columnTypeLookup);

            return {
                PutRequest: { 
                    Item: AWS.DynamoDB.Converter.marshall({
                        ...row,
                        ...this.keyMapping.columns,
                        PartitionKey: `${this.keyMapping.customerId}_${this.keyMapping.dataTableName}_${this.keyMapping.partitionKeyPrefix}` + (columnMapping.partitionKeySuffix || ""),
                        SoryKey: this.keyMapping.sortKey || columnMapping.sortKey,
                    })
                }
            };
        });

        const request = {
            RequestItems: {
                [this.ddbTable]: requests,
            },
        };

        console.log(request);

        const resp = await this.ddb.batchWriteItem(request).promise();
    
        if (resp.UnprocessedItems) {
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
        for (const item of items) {
            if (item) {
                console.log(item);
                // TODO write to S3 Dead Letter Queue
            }
        }
    }
}