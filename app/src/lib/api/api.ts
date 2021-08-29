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
    aws_apigateway as apigateway
} from "monocdk";
import { TaskInput } from "monocdk/lib/aws-stepfunctions";
import * as path from "path";

export interface LambdaRoute {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    handler: lambda.IFunction;
}

export interface ApiProps {
    lambdaRoutes: LambdaRoute[];
}

const ResourceOptions: apigateway.ResourceOptions = {
    defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
    },
};

// https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-create-iterate-pattern-section.html
export class Api extends cdk.Construct {
    private restApi: apigateway.RestApi;
    private resources: { [resource: string]: apigateway.Resource } = {};

    constructor(scope: cdk.Construct, id: string, props: ApiProps) {
        super(scope, id);

        this.restApi = new apigateway.RestApi(scope, 'Api');

        for (const route of props.lambdaRoutes) {
            this.addRoute(route);
        }
    }

    addRoute(route: LambdaRoute) {
        this.getResource(route.path).addMethod(route.method, new apigateway.LambdaIntegration(route.handler));
    }

    private getResource(path: string): apigateway.Resource {
        if (this.resources[path]) {
            return this.resources[path];
        }

        const path_parts = path.split("/");

        let resource: apigateway.Resource;
        if (path_parts.length === 1) {
            resource = this.restApi.root.addResource(path, ResourceOptions);
        } else {
            const resourceName = path_parts.pop() as string;
            resource = this.getResource(path_parts.join('/')).addResource(resourceName, ResourceOptions);
        }

        this.resources[path] = resource;

        return resource;
    }

}