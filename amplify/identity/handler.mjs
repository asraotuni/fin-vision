import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createIdentityService } from './service.mjs';
import { createIdentityHandler } from './http.mjs';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TableName = process.env.IDENTITY_TABLE;
const verifier = CognitoJwtVerifier.create({
  userPoolId:process.env.USER_POOL_ID, clientId:process.env.USER_POOL_CLIENT_ID, tokenUse:'access',
});
const service = createIdentityService({
  async get(pk){
    return (await client.send(new GetCommand({TableName, Key:{pk}, ConsistentRead:true}))).Item;
  },
  async commit(operations){
    const TransactItems = operations.map(operation => {
      if(operation.delete) return {Delete:{TableName, Key:{pk:operation.delete},
        ConditionExpression:'expiresAt = :expires AND expiresAt > :now',
        ExpressionAttributeValues:{':expires':operation.expiresAt, ':now':Math.floor(Date.now() / 1000)}}};
      return {Put:{TableName, Item:operation.put,
        ConditionExpression:operation.absent ? 'attribute_not_exists(pk)' : '#v = :version AND attribute_not_exists(parent)',
        ...(operation.absent ? {} : {ExpressionAttributeNames:{'#v':'version'}, ExpressionAttributeValues:{':version':operation.version}})}};
    });
    try { await client.send(new TransactWriteCommand({TransactItems})); return true; }
    catch(error){
      if(error.name === 'TransactionCanceledException' && error.CancellationReasons?.some(reason => reason.Code === 'ConditionalCheckFailed')) return false;
      throw error;
    }
  },
});

export const handler = createIdentityHandler(service, token => verifier.verify(token));
