import { Context } from 'aws-lambda';

// ID for a business customer
export const IAM_CUSTOMER_ID = "cognito-identity.amazonaws.com:aud";

export function getIamCustomerId(lambdaContext: Context) {
    // TODO require cognito
    return lambdaContext.identity?.cognitoIdentityPoolId || 'unauthorized';
}

// ID for a particular user of a custoemr
export const IAM_CUSTOMER_USER_ID = "cognito-identity.amazonaws.com:sub"