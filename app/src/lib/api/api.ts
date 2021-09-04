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

export interface LambdaRoute {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    handler: lambda.IFunction;
}

export interface S3GetRoute {
    method: "GET";
    path?: string;
    bucketName: string;
    key: string;
}

type S3Route = S3GetRoute;

export interface ApiProps {
    lambdaRoutes?: LambdaRoute[];
    s3Routes?: S3Route[];
}

const ResourceOptions: apigateway.ResourceOptions = {
    defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
    },
    defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.NONE,
    },
};

// https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-create-iterate-pattern-section.html
export class Api extends cdk.Construct {
    private restApi: apigateway.RestApi;
    private resources: { [resource: string]: apigateway.Resource } = {};
    private credentialsRole: iam.Role;

    constructor(scope: cdk.Construct, id: string, props: ApiProps) {
        super(scope, id);

        this.restApi = new apigateway.RestApi(scope, 'Api');
        this.credentialsRole = new iam.Role(this, "ExecutionRole", {
            assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
            path: "/service-role/",
        });

        if (props.lambdaRoutes) {
            for (const route of props.lambdaRoutes) {
                this.addLambdaRoute(route);
            }
        }

        if (props.s3Routes) {
            for (const route of props.s3Routes) {
                if (route.method === "GET") {
                    this.addGetS3Route(route);
                }
            }
        }
    }

    get endpoint() {
        return this.restApi.url
    }

    addLambdaRoute(route: LambdaRoute) {
        this.getResource(route.path).addMethod(route.method, new apigateway.LambdaIntegration(route.handler));
    }

    addGetS3Route(route: S3GetRoute) {
        this.credentialsRole.attachInlinePolicy(new iam.Policy(this, `${route.bucketName}-${route.key}-get`, {
            document: new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        resources: [
                            `arn:aws:s3:::${route.bucketName}/${route.key}`
                        ],
                        actions: ['s3:GetObject'],
                    }),
                ],
            }),
        }));

        this.getResource(route.path).addMethod("GET", new apigateway.AwsIntegration({
            service: "s3",
            integrationHttpMethod: "GET",
            path: `${route.bucketName}/${route.key}`,
            options: {
                credentialsRole: this.credentialsRole,
            },
        }));
    }

    private getResource(path?: string): apigateway.IResource {
        if (!path) {
            return this.restApi.root;
        }

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