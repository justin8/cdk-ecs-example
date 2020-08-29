# Example ECS+Lambda service

This example shows a minimal ECS+Lambda service running behind an ALB with autoscaling enabled.

## Usage

Requirements:

- A current version of NodeJS installed

1. Install yarn and the CDK CLI: `npm install aws-cdk yarn`
2. Install dependencies: `yarn install`
3. Then simply run `cdk deploy` to deploy the stack.
4. When the deploy is complete, a stack output will be provided with a link to the load balancer

## Details

This stack contains:

- A VPC with public/private subnets and NAT gateways (there are commented out blocks of a public-zone-only VPC and using an existing VPC as alternatives)
- An Application load balancer, with the default route pointing to an ECS service, and anything on the path `/lambda*` routing to a Lambda
- ECS service:
  - The ECS service is running 2-10 tasks with autoscaling based on a target of 60% CPU utilization
  - Each task contains a single Nginx webserver serving an index.html
  - The container is built on-demand by the CDK itself from the `/container` folder in this repo
- Lambda:
  - Any requests to the ALB on `/lambda*` will route to the lambda which returns back the path you accessed it on
  - The code for this is also automatically built using the `aws-lambda-python` module which installs dependencies from `requirements.txt` automatically
  - The source for the Lambda is in the `/lambda` folder in this repo
