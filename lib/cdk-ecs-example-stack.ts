import * as cdk from "@aws-cdk/core";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as logs from "@aws-cdk/aws-logs";
import * as elb_targets from "@aws-cdk/aws-elasticloadbalancingv2-targets";
import * as efs from "@aws-cdk/aws-efs";

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

    const filesystemSecurityGroup = new ec2.SecurityGroup(
      this,
      "filesystemSecurityGroup",
      { vpc }
    );

    const filesystem = new efs.FileSystem(this, "filesystem", {
      vpc,
      encrypted: true,
      securityGroup: filesystemSecurityGroup,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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

    const service = this.createFargateService(
      vpc,
      cluster,
      listener,
      filesystem,
      filesystemSecurityGroup
    );
    this.scaleFargateService(service);

    new cdk.CfnOutput(this, "LoadBalancerURL", {
      value: `http://${loadBalancer.loadBalancerDnsName}`,
    });
  }

  createFargateService(
    vpc: ec2.IVpc,
    cluster: ecs.Cluster,
    listener: elbv2.ApplicationListener,
    filesystem: efs.IFileSystem,
    filesystemSecurityGroup: ec2.ISecurityGroup
  ) {
    const taskDefinition = new ecs.FargateTaskDefinition(this, "task-def");

    const logGroup = new logs.LogGroup(this, "example-service-logs", {
      logGroupName: "example-service-logs",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      "serviceSecurityGroup",
      { vpc }
    );

    const NFSPort = ec2.Port.tcp(2049);

    filesystemSecurityGroup.addIngressRule(serviceSecurityGroup, NFSPort);
    serviceSecurityGroup.addEgressRule(filesystemSecurityGroup, NFSPort);

    taskDefinition.addVolume({
      name: "efs",
      efsVolumeConfiguration: { fileSystemId: filesystem.fileSystemId },
    });

    const webserverContainer = taskDefinition.addContainer("webserver", {
      image: ecs.ContainerImage.fromAsset("./container"), // The CDK will build our container for us upon deploy
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "webserver",
        logGroup,
      }),
    });

    webserverContainer.addMountPoints({
      containerPath: "/mnt",
      readOnly: false,
      sourceVolume: "efs",
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
      securityGroups: [serviceSecurityGroup],
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
}
