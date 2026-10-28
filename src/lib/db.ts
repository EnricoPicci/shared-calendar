import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Role } from './auth';

// One row of the hello-messages table (architecture section 5.2).
export type MessageItem = {
  messageId: string;
  userId: string;
  userName: string;
  role: Role;
  message: string;
  createdAt: string;
};

// Built once per container and reused across invocations. DYNAMODB_ENDPOINT points at
// DynamoDB Local; in the cloud the template sets it to '' and the SDK default applies.
export const documentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT || undefined }),
);

function tableName(): string {
  const name = process.env.MESSAGES_TABLE;
  if (!name) throw new Error('MESSAGES_TABLE is not set');
  return name;
}

export async function putMessage(item: MessageItem): Promise<void> {
  await documentClient.send(new PutCommand({ TableName: tableName(), Item: item }));
}
