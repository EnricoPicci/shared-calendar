import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// Placeholder until plan step 6.
export const handler = async (_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: 'not_implemented', message: 'Not implemented yet' }),
});
