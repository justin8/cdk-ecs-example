#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { CdkEcsExampleStack } from "../lib/cdk-ecs-example-stack";

const app = new cdk.App();
new CdkEcsExampleStack(app, "CdkEcsExampleStack");
