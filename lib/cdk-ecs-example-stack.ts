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

    //Create a new VPC
    const vpc = new ec2.Vpc(this, "ecs-example");

    // Alternatively, we can create a VPC without private subnets or NAT gateways
    // Best practice is to have a separate private subnet to provide more layers of
    // security; but this is cheaper and acceptable for a proof-of-concept or
    // exploring the problem.

    // const vpc = new ec2.Vpc(this, "ecs-example", {
    //   subnetConfiguration: [
    //     { name: "public1", subnetType: ec2.SubnetType.PUBLIC },
    //     { name: "public2", subnetType: ec2.SubnetType.PUBLIC },
    //   ],
    // });

    // Or you can use an existing VPC by looking it up.
    // const vpc = ec2.Vpc.fromLookup(this, "ecs-exmaple-vpc", {
    //   vpcId: "vpc-xxxxxxxx",
    // });

    const cluster = new ecs.Cluster(this, "ecs-example-cluster", {
      vpc,
      clusterName: "ecs-example",
      containerInsights: true,
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "ecs-example-alb",
      {
        vpc,
        internetFacing: true,
      }
    );

    const listener = loadBalancer.addListener("http", { port: 80 });

    const service = this.createFargateService(vpc, cluster, listener);
    this.scaleFargateService(service);
    this.attachLambda(listener);

    new cdk.CfnOutput(this, "LoadBalancerURL", {
      value: `http://${loadBalancer.loadBalancerDnsName}`,
    });
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
      image: ecs.ContainerImage.fromAsset("./container"), // The CDK will build our container for us upon deploy
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "webserver",
        logGroup,
      }),
    });

    webserverContainer.addPortMappings({ containerPort: 80 });

    // NOTE: If your container is not in a private subnet, it must be allocated a public IP.
    // If you do not do this, the container will be unable to reach the registry to pull the container image.
    const service = new ecs.FargateService(this, "example-service", {
      serviceName: "example-service",
      cluster,
      taskDefinition,
      desiredCount: 2,
      // assignPublicIp: true,
    });

    listener.addTargets("ecs-service", {
      targets: [service],
      port: 80,
      deregistrationDelay: cdk.Duration.minutes(1),
    });

    return service;
  }

  // Enabling scaling requires only the two calls below, to set a min/max and to set a metric to scale on.
  scaleFargateService(service: ecs.FargateService) {
    const scaling = service.autoScaleTaskCount({
      maxCapacity: 10,
      minCapacity: 2,
    });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 60,
    });
  }

  // We can also attach a lambda and use the ALB to route specific paths to it.
  // This is commonly used to add some new functionality or have a different
  // service, e.g. an admin panel hosted by something else.
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
