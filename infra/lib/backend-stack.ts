import * as path from 'path';
import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

const SCHEMA = path.join(__dirname, '../graphql/schema.graphql');
const TIME_ZONE = 'Europe/Amsterdam';

export class TasklisterBackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ---- DynamoDB (one table per entity; see ARCHITECTURE.md) ----
    const table = (
      logicalId: string,
      tableName: string,
      pk: string,
      sk?: string
    ) =>
      new dynamodb.Table(this, logicalId, {
        tableName,
        partitionKey: { name: pk, type: dynamodb.AttributeType.STRING },
        sortKey: sk ? { name: sk, type: dynamodb.AttributeType.STRING } : undefined,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.RETAIN,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      });

    const usersTable = table('UsersTable', 'TasklisterUsers', 'userId');
    usersTable.addGlobalSecondaryIndex({
      indexName: 'byEmail',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });
    const foldersTable = table('FoldersTable', 'TasklisterFolders', 'ownerId', 'folderId');
    const listsTable = table('ListsTable', 'TasklisterLists', 'listId');
    const membersTable = table('MembersTable', 'TasklisterListMembers', 'userId', 'listId');
    membersTable.addGlobalSecondaryIndex({
      indexName: 'byList',
      partitionKey: { name: 'listId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });
    const itemsTable = table('ItemsTable', 'TasklisterItems', 'listId', 'itemId');
    const recurringTable = table('RecurringTable', 'TasklisterRecurring', 'ownerId', 'recurringId');

    // ---- Cognito ----
    // Sign-in is by email + password, and only for accounts an admin has
    // created: self sign-up is off, and nothing is ever emailed (the admin
    // passes on the temporary password). When Google sign-in is added
    // later, a pre-sign-up trigger must reject emails that have no
    // existing user, or Google would let anyone in.
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'tasklister-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new cognito.CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Admins',
    });
    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      refreshTokenValidity: Duration.days(30),
    });

    // ---- AppSync ----
    const api = new appsync.GraphqlApi(this, 'Api', {
      name: 'tasklister-api',
      definition: appsync.Definition.fromFile(SCHEMA),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool },
        },
      },
      logConfig: { fieldLogLevel: appsync.FieldLogLevel.ERROR },
    });

    // ---- API Lambda: every query/mutation resolves here ----
    const env = {
      USERS_TABLE: usersTable.tableName,
      FOLDERS_TABLE: foldersTable.tableName,
      LISTS_TABLE: listsTable.tableName,
      MEMBERS_TABLE: membersTable.tableName,
      ITEMS_TABLE: itemsTable.tableName,
      RECURRING_TABLE: recurringTable.tableName,
      TZ_NAME: TIME_ZONE,
    };

    const apiFn = new NodejsFunction(this, 'ApiFn', {
      entry: path.join(__dirname, '../lambda/api/index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(15),
      memorySize: 512,
      environment: { ...env, USER_POOL_ID: userPool.userPoolId },
    });
    for (const t of [usersTable, foldersTable, listsTable, membersTable, itemsTable, recurringTable]) {
      t.grantReadWriteData(apiFn); // also grants the table's indexes
    }
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:AdminRemoveUserFromGroup',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminDisableUser',
          'cognito-idp:AdminEnableUser',
          'cognito-idp:AdminUserGlobalSignOut',
          'cognito-idp:ListUsers',
          'cognito-idp:ListUsersInGroup',
        ],
        resources: [userPool.userPoolArn],
      })
    );

    // Direct Lambda resolvers: no mapping templates, the event goes
    // straight to the function and `info.fieldName` picks the handler.
    const apiDS = api.addLambdaDataSource('ApiDataSource', apiFn);
    const fields: Record<string, string[]> = {
      Query: [
        'me', 'listUsers', 'listFolders', 'listLists', 'listMembers', 'listItems',
        'listAgenda', 'listPriority', 'listRecurring',
      ],
      Mutation: [
        'createUser', 'resetUserPassword', 'setUserEnabled', 'setUserAdmin',
        'createFolder', 'renameFolder', 'deleteFolder',
        'createList', 'renameList', 'deleteList', 'moveList', 'shareList', 'unshareList',
        'createItem', 'updateItem', 'setItemStatus', 'deleteItem',
        'addSubitem', 'setSubitemStatus', 'deleteSubitem',
        'createRecurring', 'updateRecurring', 'deleteRecurring',
      ],
    };
    for (const [typeName, names] of Object.entries(fields)) {
      for (const fieldName of names) {
        apiDS.createResolver(`${typeName}${fieldName}Resolver`, { typeName, fieldName });
      }
    }

    // ---- Daily recurring-item scheduler ----
    const recurringFn = new NodejsFunction(this, 'RecurringFn', {
      entry: path.join(__dirname, '../lambda/recurring/index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(60),
      environment: env,
    });
    recurringTable.grantReadWriteData(recurringFn);
    itemsTable.grantReadWriteData(recurringFn);
    membersTable.grantReadData(recurringFn);

    // 03:00 UTC = 04:00/05:00 in Amsterdam: items exist by the morning.
    new events.Rule(this, 'RecurringSchedule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '3' }),
      targets: [new targets.LambdaFunction(recurringFn, { retryAttempts: 2 })],
    });

    new CfnOutput(this, 'ApiUrl', { value: api.graphqlUrl });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}
