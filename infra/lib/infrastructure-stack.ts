import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
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
      description: 'Common DynamoDB and league-context utilities for Lambda functions'
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

    const weekFinalizerLogGroup = new logs.LogGroup(this, 'WeekFinalizerLogGroup', {
      logGroupName: '/aws/lambda/ff-week-finalizer',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const weekFinalizerFunction = new lambda.Function(this, 'WeekFinalizer', {
      functionName: 'ff-week-finalizer',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('lambda/week-finalizer', {
        exclude: pythonAssetExcludes
      }),
      environment: {
        ...leagueContextEnvironment,
        WEEKLY_STANDINGS_TABLE: weeklyStandingsTable.tableName,
        OVERALL_STANDINGS_TABLE: overallStandingsTable.tableName,
        LEAGUE_DATA_TABLE: leagueDataTable.tableName,
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      logGroup: weekFinalizerLogGroup,
      layers: [requestsLayer, commonUtilsLayer, standingsCalculationLayer]
    });

    // Monte Carlo Simulation Lambda (vectorized with NumPy)
    const monteCarloLogGroup = new logs.LogGroup(this, 'MonteCarloLogGroup', {
      logGroupName: '/aws/lambda/ff-monte-carlo',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

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
      timeout: cdk.Duration.minutes(10),
      memorySize: 3008,  // High memory for NumPy operations
      logGroup: monteCarloLogGroup,
      layers: [
        requestsLayer,
        commonUtilsLayer,
        // AWS managed layer for NumPy/Pandas
        lambda.LayerVersion.fromLayerVersionArn(this, 'NumpyLayer', 
          'arn:aws:lambda:us-west-2:336392948345:layer:AWSSDKPandas-Python311:22'
        )
      ]
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/aws/lambda/ff-api-handler',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

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
      },
      timeout: cdk.Duration.seconds(180),
      memorySize: 512,
      logGroup: apiLogGroup,
      layers: [requestsLayer, commonUtilsLayer]
    });

    // Grant DynamoDB permissions to Lambda functions

    weeklyStandingsTable.grant(
      weekFinalizerFunction,
      'dynamodb:PutItem',
      'dynamodb:Scan'
    );
    overallStandingsTable.grant(
      weekFinalizerFunction,
      'dynamodb:GetItem',
      'dynamodb:PutItem'
    );
    leagueDataTable.grant(
      weekFinalizerFunction,
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query'
    );

    weeklyStandingsTable.grant(apiFunction, 'dynamodb:Query');
    overallStandingsTable.grant(apiFunction, 'dynamodb:Query');
    leagueDataTable.grant(apiFunction, 'dynamodb:GetItem');

    weeklyStandingsTable.grant(monteCarloFunction, 'dynamodb:Query');
    overallStandingsTable.grant(
      monteCarloFunction,
      'dynamodb:Query',
      'dynamodb:UpdateItem'
    );
    leagueDataTable.grant(monteCarloFunction, 'dynamodb:Query');

    monteCarloFunction.grantInvoke(weekFinalizerFunction);
    weekFinalizerFunction.addEnvironment('MONTE_CARLO_FUNCTION', monteCarloFunction.functionName);

    new events.Rule(this, 'HourlyFinalization', {
      description: 'Finalize every completed Sleeper week and catch up after downtime',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.LambdaFunction(weekFinalizerFunction, { retryAttempts: 2 })]
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'FantasyFootballApi', {
      restApiName: 'fantasy-football-vs-everyone',
      description: 'API for Fantasy Football vs Everyone app',
      minCompressionSize: cdk.Size.kibibytes(1),
      deployOptions: {
        throttlingRateLimit: 5,
        throttlingBurstLimit: 100
      }
    });

    // API Routes
    const apiIntegration = new apigateway.LambdaIntegration(apiFunction);
    const weeklyResource = api.root.addResource('weekly');
    weeklyResource.addMethod('GET', apiIntegration);
    weeklyResource.addMethod('OPTIONS', apiIntegration);

    const overallResource = api.root.addResource('overall');
    overallResource.addMethod('GET', apiIntegration);
    overallResource.addMethod('OPTIONS', apiIntegration);

    const leagueContextResource = api.root.addResource('league-context');
    leagueContextResource.addMethod('GET', apiIntegration);
    leagueContextResource.addMethod('OPTIONS', apiIntegration);

    const playersResource = api.root.addResource('players');
    playersResource.addMethod('GET', apiIntegration);
    playersResource.addMethod('OPTIONS', apiIntegration);

    // Stack Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Fantasy Football API URL'
    });

  }
}
