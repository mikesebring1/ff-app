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

  test('schedules the finalizer and isolates on-demand AI analysis', () => {
    template.resourceCountIs('AWS::Lambda::Function', 5);
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
    const summaryFunctions = Object.values(functions).filter(
      (resource: any) => resource.Properties.FunctionName === 'ff-team-summary'
    ) as any[];
    expect(summaryFunctions).toHaveLength(1);
    expect(summaryFunctions[0].Properties.ReservedConcurrentExecutions).toBe(2);
    const reviewFunctions = Object.values(functions).filter(
      (resource: any) => resource.Properties.FunctionName === 'ff-weekly-review'
    ) as any[];
    expect(reviewFunctions).toHaveLength(1);
    expect(reviewFunctions[0].Properties.ReservedConcurrentExecutions).toBe(1);
    expect(
      Object.values(functions)
        .filter((resource: any) => !['ff-team-summary', 'ff-weekly-review'].includes(
          resource.Properties.FunctionName
        ))
        .every((resource: any) => resource.Properties.ReservedConcurrentExecutions === undefined)
    ).toBe(true);

    template.resourceCountIs('AWS::Logs::LogGroup', 5);
    for (const logGroupName of [
      '/aws/lambda/ff-week-finalizer',
      '/aws/lambda/ff-monte-carlo',
      '/aws/lambda/ff-api-handler',
      '/aws/lambda/ff-team-summary',
      '/aws/lambda/ff-weekly-review'
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
    expect(nonOptions).toHaveLength(6);
    expect(
      nonOptions.filter((method: any) => method.Properties.HttpMethod === 'GET')
    ).toHaveLength(4);
    expect(
      nonOptions.filter((method: any) => method.Properties.HttpMethod === 'POST')
    ).toHaveLength(2);
    expect(options).toHaveLength(6);
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
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'team-summary'
    });
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'weekly-review'
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
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      FunctionName: 'ff-team-summary',
      ReservedConcurrentExecutions: 2,
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          OPENROUTER_MODEL: 'google/gemini-2.5-flash',
          OPENROUTER_SECRET_ID: Match.anyValue()
        })
      })
    }));
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      FunctionName: 'ff-weekly-review',
      ReservedConcurrentExecutions: 1,
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          OPENROUTER_MODEL: 'google/gemini-2.5-flash',
          OPENROUTER_SECRET_ID: Match.anyValue(),
          WEEKLY_STANDINGS_TABLE: Match.anyValue()
        })
      })
    }));
    expect(rendered).toContain('secretsmanager:GetSecretValue');
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
