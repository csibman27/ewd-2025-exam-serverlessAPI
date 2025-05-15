import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { generateBatch } from "../shared/util";
import { schedules } from "../seed/movies";
import * as apig from "aws-cdk-lib/aws-apigateway";

export class ExamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // NOTE: This table declaration is incomplete, and will cause a deployment to fail.
    // The correct code will be provided in the exam question.
    const table = new dynamodb.Table(this, "CinemasTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "cinemaId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "movieId", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "CinemaTable",
 });

  table.addLocalSecondaryIndex({
      indexName: "periodIx",
      sortKey: { name: "period", type: dynamodb.AttributeType.STRING },
 });


 // Functions
    const getCinemaIdFn = new lambdanode.NodejsFunction(
      this,
      "GetCinemaIdFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/getCinemaId.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: table.tableName,
          REGION: "eu-west-1",
        },
      }
    );


    const question1Fn = new lambdanode.NodejsFunction(this, "QuestionFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/question.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        REGION: "eu-west-1",
      },
    });

    table.grantReadData(getCinemaIdFn);

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [table.tableName]: generateBatch(schedules),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [table.tableArn],
      }),
    });


    

    const api = new apig.RestApi(this, "ExamAPI", {
      description: "Exam api",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });


    // You are required to add a new endpoint to the REST API, defined as follows:

// GET /cinemas/{cinemaId}/movies?movie=movieId - Get the details of the movie with the specified id
// for the particular cinema, e.g. GET /cinemas/1001/movies?movieId=c5002 - get the details
// of movie c5002 for cinema 1001. Note that when the movie query string is omitted, the API should
// return all the movies for the cinema.


    // Gateway endpoints

    // Cinema endpoint
    const moviesEndpoint = api.root.addResource("cinemas");

    // endpoint for cinemaId
    const specificMovieEndpoint = moviesEndpoint.addResource("{cinemaId}");


    // endpoint for cinemaId/movies
    const movieReviewEndpointCinema = specificMovieEndpoint.addResource("movies");

    movieReviewEndpointCinema.addMethod(
      "GET",
      new apig.LambdaIntegration(getCinemaIdFn, { proxy: true })
    );

  }
}
