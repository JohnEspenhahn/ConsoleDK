import { Duration } from "@aws-cdk/core";
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
} from "monocdk";
import { TaskInput } from "monocdk/lib/aws-stepfunctions";
import * as path from "path";
import { XRAY_TRACE } from "../global-config";
import { Parameters } from "./code/arguments";

export interface LongRunningLambdaProps {
    processor: lambda.Alias;
    timeout: cdk.Duration;
    dlq: sqs.Queue;
}

// https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-create-iterate-pattern-section.html
export class LongRunningLambda extends cdk.Construct {
    private readonly entryPoint: lambda.Function;
    private readonly machine: stepfunctions.StateMachine;
    private readonly logGroup: logs.LogGroup;

    constructor(scope: cdk.Construct, id: string, props: LongRunningLambdaProps) {
        super(scope, id);

        const invokeProcessor = new tasks.LambdaInvoke(this, 'invoke', {
            lambdaFunction: props.processor,
            invocationType: tasks.LambdaInvocationType.REQUEST_RESPONSE,
            outputPath: "$.Payload.cdkResult"
        });

        invokeProcessor
            .next(
                new stepfunctions.Choice(this, 'loop').when(
                    stepfunctions.Condition.and(
                        stepfunctions.Condition.isPresent("$.Next"),
                        stepfunctions.Condition.isNotNull("$.Next"),
                    ),
                    invokeProcessor,
                ).otherwise(new stepfunctions.Succeed(this, 'succeed'))
            );

        invokeProcessor
            .addRetry({
                errors: ["TooManyRequestsException"],
            })
            .addCatch(
                new tasks.SqsSendMessage(scope, 'todql', {
                    queue: props.dlq,
                    messageBody: TaskInput.fromJsonPathAt("$"),
                }).next(new stepfunctions.Fail(this, 'fail'))
            );
        
        this.logGroup = new logs.LogGroup(this, 'logs', {
            retention: logs.RetentionDays.ONE_MONTH,
        });
        this.machine = new stepfunctions.StateMachine(this, 'machine', {
            definition: invokeProcessor,
            timeout: props.timeout,
            tracingEnabled: XRAY_TRACE,
            logs: {
                destination: this.logGroup,
            },
        });

        this.entryPoint = new lambdajs.NodejsFunction(this, 'entry', {
            memorySize: 128,
            timeout: cdk.Duration.seconds(45),
            handler: 'main',
            entry: path.join(__dirname, '/code/long-running-lambda-entry.ts'),
            projectRoot: path.join(__dirname, '/code/'),
            depsLockFilePath: path.join(__dirname, '/code/package-lock.json'),
            environment: {
                [Parameters.STEP_FUNCTION]: this.machine.stateMachineArn,
            },
            tracing: XRAY_TRACE ? lambda.Tracing.ACTIVE : lambda.Tracing.PASS_THROUGH,
            logRetention: logs.RetentionDays.ONE_MONTH,
        });
        this.entryPoint.role?.attachInlinePolicy(new iam.Policy(this, 'entrypolicy', {
            statements: [
                new iam.PolicyStatement({
                    actions: ["states:StartExecution"],
                    resources: [this.machine.stateMachineArn],
                }),
            ],
        }));
    }

    addEventSource = (source: lambda.IEventSource) => {
        this.entryPoint.addEventSource(source);
    };

}