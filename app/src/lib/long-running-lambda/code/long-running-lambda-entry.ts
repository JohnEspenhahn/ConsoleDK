import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { Parameters } from "./arguments";

export async function main(event: any, context: any, callback: any) {
    if (!process.env[Parameters.STEP_FUNCTION]) {
        throw new Error("No step function found in env");
    }

    const stepfunctions = AWSXRay.captureAWSClient(new AWS.StepFunctions());

    try {
        const execution = await stepfunctions.startExecution({
            input: JSON.stringify(event),
            stateMachineArn: "" + process.env[Parameters.STEP_FUNCTION],
            traceHeader: process.env._X_AMZN_TRACE_ID,
        }).promise();

        return {
            executionArn: execution.executionArn
        };
    } catch (e) {
        throw e;
    }
}