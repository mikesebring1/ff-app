import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { InfrastructureStack } from '../lib/infrastructure-stack';

describe('streamlined infrastructure', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack', {
    env: { account: '111111111111', region: 'us-west-2' }
  });
  const template = Template.fromStack(stack);
  const rendered = JSON.stringify(template.toJSON());

  test('retains exactly the three existing data tables', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 3);
    for (const tableName of [
      'ff-weekly-standings',
      'ff-overall-standings',
      'ff-league-data'
    ]) {
      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
        Properties: Match.objectLike({ TableName: tableName })
      });
    }
    expect(rendered).not.toContain('ff-polling-state');
  });

  test('schedules the finalizer and keeps public API read-only', () => {
    template.resourceCountIs('AWS::Lambda::Function', 3);
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 hour)',
      State: 'ENABLED',
      Targets: Match.arrayWith([
        Match.objectLike({ RetryPolicy: { MaximumRetryAttempts: 2 } })
      ])
    });
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      FunctionName: 'ff-week-finalizer',
      MemorySize: 512,
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          SLEEPER_LEAGUE_SEED_ID: '1388309161581752320'
        })
      })
    }));

    const functions = template.findResources('AWS::Lambda::Function');
    expect(
      Object.values(functions).every(
        (resource: any) => resource.Properties.ReservedConcurrentExecutions === undefined
      )
    ).toBe(true);

    template.resourceCountIs('AWS::Logs::LogGroup', 3);
    for (const logGroupName of [
      '/aws/lambda/ff-week-finalizer',
      '/aws/lambda/ff-monte-carlo',
      '/aws/lambda/ff-api-handler'
    ]) {
      template.hasResource('AWS::Logs::LogGroup', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
        Properties: Match.objectLike({
          LogGroupName: logGroupName,
          RetentionInDays: 7
        })
      });
    }

    const methods = template.findResources('AWS::ApiGateway::Method');
    const nonOptions = Object.values(methods).filter(
      (method: any) => method.Properties.HttpMethod !== 'OPTIONS'
    );
    const options = Object.values(methods).filter(
      (method: any) => method.Properties.HttpMethod === 'OPTIONS'
    );
    expect(nonOptions).toHaveLength(4);
    expect(nonOptions.every((method: any) => method.Properties.HttpMethod === 'GET')).toBe(true);
    expect(options).toHaveLength(4);
    expect(
      Object.values(methods).every(
        (method: any) => method.Properties.Integration.Type === 'AWS_PROXY'
      )
    ).toBe(true);
    expect(rendered).not.toContain('Access-Control-Allow-Origin');

    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      MinimumCompressionSize: 1024
    });
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'players'
    });
    template.hasResourceProperties('AWS::ApiGateway::Stage', Match.objectLike({
      MethodSettings: Match.arrayWith([
        Match.objectLike({
          HttpMethod: '*',
          ResourcePath: '/*',
          ThrottlingRateLimit: 5,
          ThrottlingBurstLimit: 100
        })
      ])
    }));
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      FunctionName: 'ff-api-handler',
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          LEAGUE_DATA_TABLE: Match.anyValue()
        })
      })
    }));
  });

  test('contains no retired polling or admin infrastructure', () => {
    for (const resourceType of [
      'AWS::ECS::Cluster',
      'AWS::ECS::TaskDefinition',
      'AWS::ECR::Repository',
      'AWS::EC2::VPC',
      'AWS::EC2::SecurityGroup'
    ]) {
      template.resourceCountIs(resourceType, 0);
    }
    expect(rendered).not.toMatch(/ADMIN_API_KEY|admin\/validate|calculate-playoffs|sync-historical/i);
    expect(rendered).not.toMatch(/ecs:RunTask|ecs:StopTask|iam:PassRole|ff-polling/i);
  });

  test('uses only the DynamoDB actions each handler needs', () => {
    expect(rendered).not.toMatch(/dynamodb:DeleteItem|dynamodb:BatchWriteItem/);
    for (const action of [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
      'dynamodb:Scan'
    ]) {
      expect(rendered).toContain(action);
    }
  });
});
