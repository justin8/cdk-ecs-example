import * as cdk from "@aws-cdk/core";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as logs from "@aws-cdk/aws-logs";
import * as s3 from "@aws-cdk/aws-s3";
import { PythonFunction } from "@aws-cdk/aws-lambda-python";
import * as elb_targets from "@aws-cdk/aws-elasticloadbalancingv2-targets";

export class CdkEcsExampleStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "ecs-example");

    const cluster = new ecs.Cluster(this, "ecs-example-cluster", {
      vpc,
      clusterName: "ecs-example",
      containerInsights: true,
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "ecs-example-alb",
      { vpc, internetFacing: true }
    );

    const listener = loadBalancer.addListener("http", { port: 80 });

    const service = this.createFargateService(vpc, cluster, listener);
    this.scaleFargateService(service);
    this.attachLambda(listener);
  }

  createFargateService(
    vpc: ec2.IVpc,
    cluster: ecs.Cluster,
    listener: elbv2.ApplicationListener
  ) {
    const taskDefinition = new ecs.FargateTaskDefinition(this, "task-def");

    const logGroup = new logs.LogGroup(this, "example-service-logs", {
      logGroupName: "example-service-logs",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const webserverContainer = taskDefinition.addContainer("webserver", {
      image: ecs.ContainerImage.fromAsset("container"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "my-example-service",
        logGroup,
      }),
    });

    webserverContainer.addPortMappings({ containerPort: 80 });

    const service = new ecs.FargateService(this, "example-service", {
      serviceName: "example-service",
      cluster,
      taskDefinition,
      desiredCount: 2,
    });

    listener.addTargets("ecs-service", { targets: [service], port: 80 });

    return service;
  }

  scaleFargateService(service: ecs.FargateService) {
    const scaling = service.autoScaleTaskCount({
      maxCapacity: 10,
      minCapacity: 2,
    });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 60,
    });
  }

  attachLambda(listener: elbv2.ApplicationListener) {
    const func = new PythonFunction(this, "lambda-func", { entry: "lambda" });

    const bucket = new s3.Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    bucket.grantReadWrite(func);

    listener.addTargets("lambda", {
      conditions: [elbv2.ListenerCondition.pathPatterns(["/lambda*"])],
      priority: 10,
      targets: [new elb_targets.LambdaTarget(func)],
    });
  }
}
