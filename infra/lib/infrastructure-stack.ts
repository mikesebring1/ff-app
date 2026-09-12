import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The seed permanently anchors this league's renewal lineage. Future seasons
    // are discovered through the stable member ID and validated league name.
    const leagueContextEnvironment = {
      SLEEPER_LEAGUE_SEED_ID: this.node.tryGetContext('sleeperLeagueSeedId') || '1388309161581752320',
      SLEEPER_LEAGUE_USER_ID: this.node.tryGetContext('sleeperLeagueUserId') || '475076051211382784',
      SLEEPER_LEAGUE_NAME: this.node.tryGetContext('sleeperLeagueName') || "Madtown's Finest"
    };
    const pythonAssetExcludes = [
      '**/__pycache__',
      '**/__pycache__/**',
      '**/*.pyc',
      '**/*.pyo'
    ];

    const adminApiKey = this.node.tryGetContext('adminKey') || process.env.ADMIN_API_KEY;
    if (!adminApiKey) {
      throw new Error('Set --context adminKey=<key> or ADMIN_API_KEY before synthesizing the stack');
    }

    // DynamoDB Tables
    const weeklyStandingsTable = new dynamodb.Table(this, 'WeeklyStandings', {
      tableName: 'ff-weekly-standings',
      partitionKey: { name: 'season_week', type: dynamodb.AttributeType.STRING }, // e.g., "2026_1"
      sortKey: { name: 'team_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const overallStandingsTable = new dynamodb.Table(this, 'OverallStandings', {
      tableName: 'ff-overall-standings',
      partitionKey: { name: 'season', type: dynamodb.AttributeType.STRING }, // e.g., "2026"
      sortKey: { name: 'team_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const leagueDataTable = new dynamodb.Table(this, 'LeagueData', {
      tableName: 'ff-league-data',
      partitionKey: { name: 'data_type', type: dynamodb.AttributeType.STRING }, // 'users', 'rosters', 'league_info'
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const pollingStateTable = new dynamodb.Table(this, 'PollingState', {
      tableName: 'ff-polling-state',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }, // 'polling_status'
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // VPC for Fargate services
    const vpc = new ec2.Vpc(this, 'FFVpc', {
      maxAzs: 2,
      natGateways: 0, // Use public subnets only to save costs
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ]
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'FFCluster', {
      clusterName: 'ff-cluster',
      vpc: vpc,
      containerInsights: true
    });

    // Security Group for ECS tasks (allow ECR and internet access)
    const ecsTaskSecurityGroup = new ec2.SecurityGroup(this, 'EcsTaskSecurityGroup', {
      vpc: vpc,
      description: 'Security group for FF ECS tasks',
      allowAllOutbound: true // Allow all outbound traffic for ECR, API calls, etc.
    });

    // ECR Repositories for container images
    const pollingRepo = new ecr.Repository(this, 'PollingRepo', {
      repositoryName: 'ff-polling-service',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // CloudWatch Log Groups
    const pollingLogGroup = new logs.LogGroup(this, 'PollingLogGroup', {
      logGroupName: '/ff/polling-service',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // IAM Role for Fargate tasks
    const fargateTaskRole = new iam.Role(this, 'FargateTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan'
              ],
              resources: [
                weeklyStandingsTable.tableArn,
                overallStandingsTable.tableArn,
                leagueDataTable.tableArn,
                pollingStateTable.tableArn
              ]
            })
          ]
        })
      }
    });

    // ECS Task Execution Role
    const fargateExecutionRole = new iam.Role(this, 'FargateExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // ECS Task Definitions
    const pollingTaskDefinition = new ecs.FargateTaskDefinition(this, 'PollingTaskDefinition', {
      family: 'ff-polling-service',
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole: fargateTaskRole,
      executionRole: fargateExecutionRole
    });

    pollingTaskDefinition.addContainer('polling-container', {
      containerName: 'polling-service',
      image: ecs.ContainerImage.fromEcrRepository(pollingRepo, 'latest'),
      environment: {
        ...leagueContextEnvironment,
        WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
        OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
        LEAGUE_DATA_TABLE: leagueDataTable.tableName,
        POLLING_STATE_TABLE: pollingStateTable.tableName,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'polling',
        logGroup: pollingLogGroup
      })
    });

    // Shared Lambda Layers
    const requestsLayer = new lambda.LayerVersion(this, 'RequestsLayer', {
      layerVersionName: 'ff-requests-layer',
      code: lambda.Code.fromAsset('layers/requests-layer', {
        exclude: pythonAssetExcludes
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Requests library for all Lambda functions'
    });

    const commonUtilsLayer = new lambda.LayerVersion(this, 'CommonUtilsLayer', {
      layerVersionName: 'ff-common-utils-layer',
      code: lambda.Code.fromAsset('layers/common-utils', {
        exclude: pythonAssetExcludes
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Common utilities (DynamoDB, auth) for all Lambda functions'
    });

    // New: Standings calculation layer providing ff_standings package
    const standingsCalculationLayer = new lambda.LayerVersion(this, 'StandingsCalculationLayer', {
      layerVersionName: 'ff-standings-calculation-layer',
      code: lambda.Code.fromAsset('../packages/ff-standings', {
        exclude: pythonAssetExcludes,
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash',
            '-c',
            'mkdir -p /asset-output/python && python -c "import shutil; shutil.copytree(\'/asset-input/src/ff_standings\', \'/asset-output/python/ff_standings\', ignore=shutil.ignore_patterns(\'__pycache__\', \'*.pyc\', \'*.pyo\'))"'
          ],
          local: {
            tryBundle(outputDir: string) {
              try {
                const path = require('path');
                const fs = require('fs');
                const pythonDir = path.join(outputDir, 'python');
                if (!fs.existsSync(pythonDir)) {
                  fs.mkdirSync(pythonDir, { recursive: true });
                }
                // Resolve absolute path to packages/ff-standings from compiled file location (infra/lib)
                const packagePath = path.resolve(__dirname, '../../packages/ff-standings');
                if (!fs.existsSync(packagePath)) {
                  throw new Error(`ff-standings package not found at ${packagePath}`);
                }
                fs.cpSync(
                  path.join(packagePath, 'src', 'ff_standings'),
                  path.join(pythonDir, 'ff_standings'),
                  {
                    recursive: true,
                    filter: (source: string) => {
                      const basename = path.basename(source);
                      return basename !== '__pycache__' && !/\.py[co]$/.test(basename);
                    }
                  }
                );
                return true;
              } catch (e) {
                console.error('Local bundling failed for ff-standings:', e);
                return false;
              }
            }
          }
        }
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Standings calculation library (ff_standings) shared across Lambdas'
    });

    // Lambda Functions

    const historicalBackfillFunction = new lambda.Function(this, 'HistoricalBackfill', {
      functionName: 'ff-historical-backfill',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('lambda/historical-backfill', {
        exclude: pythonAssetExcludes
      }),
      environment: {
        ...leagueContextEnvironment,
        WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
        OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
        LEAGUE_DATA_TABLE: leagueDataTable.tableName,
      },
      timeout: cdk.Duration.minutes(5),
      layers: [requestsLayer, commonUtilsLayer, standingsCalculationLayer]
    });

    // Monte Carlo Simulation Lambda (vectorized with NumPy)
    const monteCarloFunction = new lambda.Function(this, 'MonteCarloFunction', {
      functionName: 'ff-monte-carlo',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('lambda/monte-carlo', {
        exclude: pythonAssetExcludes
      }),
      environment: {
        ...leagueContextEnvironment,
        WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
        OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
        LEAGUE_DATA_TABLE: leagueDataTable.tableName
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008,  // High memory for NumPy operations
      layers: [
        requestsLayer,
        commonUtilsLayer,
        // AWS managed layer for NumPy/Pandas
        lambda.LayerVersion.fromLayerVersionArn(this, 'NumpyLayer', 
          'arn:aws:lambda:us-west-2:336392948345:layer:AWSSDKPandas-Python311:22'
        )
      ]
    });

    // Enhanced API Handler with ECS permissions
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      functionName: 'ff-api-handler',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('lambda/api-handler', {
        exclude: pythonAssetExcludes
      }),
      environment: {
        ...leagueContextEnvironment,
        WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
        OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
        LEAGUE_DATA_TABLE: leagueDataTable.tableName,
        POLLING_STATE_TABLE: pollingStateTable.tableName,
        ECS_CLUSTER_ARN: cluster.clusterArn,
        POLLING_TASK_DEFINITION_ARN: pollingTaskDefinition.taskDefinitionArn,
        SUBNET_IDS: vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
        SECURITY_GROUP_ID: ecsTaskSecurityGroup.securityGroupId,
        HISTORICAL_BACKFILL_FUNCTION: 'ff-historical-backfill',
        MONTE_CARLO_FUNCTION: 'ff-monte-carlo',
        ADMIN_API_KEY: adminApiKey
      },
      timeout: cdk.Duration.seconds(180),
      memorySize: 512,
      layers: [requestsLayer, commonUtilsLayer]
    });

    // Grant DynamoDB permissions to Lambda functions

    weeklyStandingsTable.grantReadWriteData(historicalBackfillFunction);
    overallStandingsTable.grantReadWriteData(historicalBackfillFunction);
    leagueDataTable.grantReadWriteData(historicalBackfillFunction);

    weeklyStandingsTable.grantReadData(apiFunction);
    overallStandingsTable.grantReadData(apiFunction);
    leagueDataTable.grantReadData(apiFunction);
    pollingStateTable.grantReadWriteData(apiFunction);

    weeklyStandingsTable.grantReadData(monteCarloFunction);
    overallStandingsTable.grantReadWriteData(monteCarloFunction);
    leagueDataTable.grantReadData(monteCarloFunction);

    // Grant Lambda invoke permissions
    historicalBackfillFunction.grantInvoke(apiFunction);
    monteCarloFunction.grantInvoke(apiFunction);

    // Grant ECS permissions to API handler
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:RunTask',
        'ecs:StopTask',
        'ecs:DescribeTasks',
        'ecs:ListTasks',
        'ecs:TagResource'
      ],
      resources: [
        pollingTaskDefinition.taskDefinitionArn,
        `${cluster.clusterArn}/*`,
        `arn:aws:ecs:${this.region}:${this.account}:task/${cluster.clusterName}/*`
      ]
    }));

    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [
        fargateTaskRole.roleArn,
        fargateExecutionRole.roleArn
      ]
    }));

    apiFunction.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess')
    )

    // API Gateway
    const api = new apigateway.RestApi(this, 'FantasyFootballApi', {
      restApiName: 'fantasy-football-vs-everyone',
      description: 'API for Fantasy Football vs Everyone app',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Admin-Key']
      }
    });

    // API Routes
    const weeklyResource = api.root.addResource('weekly');
    weeklyResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    const overallResource = api.root.addResource('overall');
    overallResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    const leagueContextResource = api.root.addResource('league-context');
    leagueContextResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    const nflStateResource = api.root.addResource('nfl-state');
    nflStateResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    const pollingResource = api.root.addResource('polling');
    const pollingStatusResource = pollingResource.addResource('status');
    pollingStatusResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
    
    const pollingToggleResource = pollingResource.addResource('toggle');
    pollingToggleResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));

    const calculatePlayoffsResource = api.root.addResource('calculate-playoffs');
    calculatePlayoffsResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));

    const syncHistoricalResource = api.root.addResource('sync-historical');
    syncHistoricalResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));

    const playersResource = api.root.addResource('players');
    playersResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    const adminResource = api.root.addResource('admin');
    const adminValidateResource = adminResource.addResource('validate');
    adminValidateResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));

    // Stack Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Fantasy Football API URL'
    });

    new cdk.CfnOutput(this, 'PollingRepoUri', {
      value: pollingRepo.repositoryUri,
      description: 'ECR Repository URI for polling service'
    });


    new cdk.CfnOutput(this, 'ClusterArn', {
      value: cluster.clusterArn,
      description: 'ECS Cluster ARN'
    });
  }
}
