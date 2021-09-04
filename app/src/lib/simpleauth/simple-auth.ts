import * as cdk from 'monocdk';
import {
    aws_cognito as cognito, 
    aws_iam as iam,
    Duration,
} from 'monocdk';
import { Api } from '../api/api';

interface Customer {
    id: string;
    name: string;
    signup: {
        verificationSubject?: string;
        verificationBody?: string;

    }
}

export interface SimpleAuthProps {
    api: Api;
    customers: Customer[];
}

export class SimpleAuth extends cdk.Construct {

    private props: SimpleAuthProps;

    constructor(scope: cdk.Construct, id: string, props: SimpleAuthProps) {
        super(scope, id);
        this.props = props;

        for (const customer of props.customers) {
            this.createPool(customer);
        }
    }

    createPool(customer: Customer) {
        const userPool = new cognito.UserPool(this, customer.id, {
            selfSignUpEnabled: true,
            userVerification: {
                emailSubject: customer.signup.verificationSubject || "Verify your email",
                emailBody: customer.signup.verificationBody || "Thanks for signing up. {##Verify Email##}",
                emailStyle: cognito.VerificationEmailStyle.LINK,
            },
            signInAliases: {
                username: true,
                email: true,
            },
            customAttributes: {
                'joinedOn': new cognito.DateTimeAttribute(),
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        })

        const clientWriteAttributes = (new cognito.ClientAttributes())
            .withStandardAttributes({fullname: true, email: true});

        const clientReadAttributes = clientWriteAttributes
            .withStandardAttributes({emailVerified: true});

        const userPoolClient = userPool.addClient('client', {
            preventUserExistenceErrors: true,
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [ cognito.OAuthScope.OPENID ],
                callbackUrls: [
                    this.props.api.endpoint,
                ],
                logoutUrls: [
                    this.props.api.endpoint,
                ],
            },
            accessTokenValidity: Duration.hours(6),
            idTokenValidity: Duration.hours(6),
            refreshTokenValidity: Duration.days(7),
            readAttributes: clientReadAttributes,
            writeAttributes: clientWriteAttributes,
        });

        const identityPool = new cognito.CfnIdentityPool(this, customer.id + '-identity', {
            identityPoolName: customer.id,
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: userPoolClient.userPoolClientId,
                    providerName: userPool.userPoolProviderName,
                },
            ],
        });

        const isUserCognitoGroupRole = new iam.Role(this, 'users-group-role', {
            description: 'Default role for authenticated users',
            assumedBy: new iam.FederatedPrincipal(
              'cognito-identity.amazonaws.com',
              {
                StringEquals: {
                  'cognito-identity.amazonaws.com:aud': identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                  'cognito-identity.amazonaws.com:amr': 'authenticated',
                },
              },
              'sts:AssumeRoleWithWebIdentity',
            ),
            managedPolicies: [
              iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
            ],
        });

        new cognito.CfnIdentityPoolRoleAttachment(
            this,
            'identity-pool-role-attachment',
            {
              identityPoolId: identityPool.ref,
              roles: {
                authenticated: isUserCognitoGroupRole.roleArn,
              },
              roleMappings: {
                mapping: {
                  type: 'Token',
                  ambiguousRoleResolution: 'AuthenticatedRole',
                  identityProvider: `cognito-idp.${
                    cdk.Stack.of(this).region
                  }.amazonaws.com/${userPool.userPoolId}:${
                    userPoolClient.userPoolClientId
                  }`,
                },
              },
            },
        );

        // TODO migration service: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-import-using-lambda.html
    }

}