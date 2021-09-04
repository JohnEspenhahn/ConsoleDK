import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics';
import { Handler, Context } from 'aws-lambda';
import { Parameters } from './arguments';

interface Event {
    Next?: {
        Token: string;
    }
}

/**
 * 
 * @param event SQSEvent + optional Next
 * @param context 
 */
export const main: Handler<Event> = metricScope(metrics => async function(event: Event, context: Context) {
    metrics.setProperty("RequestId", context.awsRequestId);
    if (process.env["_X_AMZN_TRACE_ID"]) {
        metrics.setProperty("XRAYTraceId", process.env["_X_AMZN_TRACE_ID"]);
    }

    // Configure metrics dimension
    const customer_id = getIamCustomerId(context);
    metrics.setDimensions({ Service: "Ingestion", CustomerId: customer_id }); // TODO require identity pool

    console.log(event);

    if (!process.env[Parameters.DDB_TABLE]) {
        throw new Error("No table provided in envionrment");
    } else if (!process.env[Parameters.PARTITION_KEY]) {
        throw new Error("No partition key provided in envionrment");
    }

    const table_name = "" + process.env[Parameters.DDB_TABLE];
    const partition_key = "" + process.env[Parameters.PARTITION_KEY];
    
    const ddb = AWSXRay.captureAWSClient(new AWS.DynamoDB());
    const query: AWS.DynamoDB.ExecuteStatementInput = {
        Statement: `SELECT * FROM ${table_name} WHERE ${partition_key} = ?`,
        Parameters: [
            { "S": `${customer_id}_UPS` }
        ],
    };

    if (event.Next) {
        query.NextToken = event.Next.Token;
    }

    const results = await ddb.executeStatement(query).promise();

    let items: any = [];
    if (results.Items) {
        emitQueryMetric(metrics, results.Items.length);

        items = results.Items
            .map(item => AWS.DynamoDB.Converter.unmarshall(item))
            .map(item => {
                try {
                    // Partition key will be like {customerid}_{value}
                    item[partition_key] = item[partition_key].split("_", 2)[1]
                    return item;
                } catch {
                    return null;
                }
            });
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            Items: items,
            Next: {
                Token: results.NextToken,
            },
        }),
    };
});

function emitQueryMetric(metrics: MetricsLogger, rows: number) {
    metrics.putMetric("Rows", rows, Unit.Count)
}

function getIamCustomerId(lambdaContext: Context) {
    // TODO require cognito
    return lambdaContext.identity?.cognitoIdentityPoolId || 'customerid' || 'unauthorized';
}
