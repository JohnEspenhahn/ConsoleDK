import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics';
import { Handler, Context } from 'aws-lambda';
import { Parameters } from './arguments';
import { getIamCustomerId } from '../../simpleauth/constants';

interface Event {
    NextToken?: AWS.DynamoDB.PartiQLNextToken;
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
    }

    const table_name = process.env[Parameters.DDB_TABLE];
    
    const ddb = AWSXRay.captureAWSClient(new AWS.DynamoDB());
    const query: AWS.DynamoDB.ExecuteStatementInput = {
        Statement: `SELECT * FROM ${table_name}`,
    };

    if (event.NextToken) {
        query.NextToken = event.NextToken;
    }

    const results = await ddb.executeStatement(query).promise();

    // Record metrics
    if (results.Items) {
        emitQueryMetric(metrics, results.Items.length);
    }

    return {
        Items: results.Items?.map(item => AWS.DynamoDB.Converter.unmarshall(item)),
        NextToken: results.NextToken,
    };
});

function emitQueryMetric(metrics: MetricsLogger, rows: number) {
    metrics.putMetric("Rows", rows, Unit.Count)
}
