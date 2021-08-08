import * as cdk from "monocdk";
import { 
    aws_s3 as s3, 
    aws_sqs as sqs, 
    aws_s3_notifications as s3notify,
    aws_lambda_nodejs as lambdajs,
    aws_lambda as lambda,
    aws_stepfunctions as stepfunctions,
    aws_stepfunctions_tasks as tasks,
    aws_logs as logs,
    aws_iam as iam,
    aws_lambda_event_sources as eventsources,
    aws_events as events,
    aws_events_targets as eventtargets,
} from "monocdk";
import * as path from "path";
import { XRAY_TRACE } from "../global-config";

export class Janitor extends cdk.Construct {
    private readonly lambda: lambda.Function;

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        this.lambda = new lambdajs.NodejsFunction(this, 'entry', {
            memorySize: 128,
            timeout: cdk.Duration.minutes(5),
            handler: 'main',
            entry: path.join(__dirname, '/code/janitor-entry.js'),
            projectRoot: path.join(__dirname, '/code/'),
            depsLockFilePath: path.join(__dirname, '/code/package-lock.json'),
            tracing: XRAY_TRACE ? lambda.Tracing.ACTIVE : lambda.Tracing.DISABLED,
            logRetention: logs.RetentionDays.ONE_WEEK,
        });
        this.lambda.role?.attachInlinePolicy(new iam.Policy(this, 'entrypolicy', {
            statements: [
                new iam.PolicyStatement({
                    actions: [
                        "lambda:List*",
                        "lambda:Delete*",
                    ],
                    resources: ["*"],
                }),
            ],
        }));

        new events.Rule(this, 'schedule', {
            schedule: events.Schedule.rate(cdk.Duration.days(1)),
            targets: [
                new eventtargets.LambdaFunction(this.lambda),
            ],
        });
    }

}