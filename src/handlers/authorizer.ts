import type { APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerResult } from 'aws-lambda';

// Placeholder until plan step 5: denies every request.
export const handler = async (
  _event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerResult> => ({ isAuthorized: false });
