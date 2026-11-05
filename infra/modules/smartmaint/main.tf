terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name           = "smartmaint-${var.environment}"
  azs            = slice(data.aws_availability_zones.available.names, 0, 2)
  container_name = "smartmaint"
  container_port = 3001
  is_production  = var.environment == "production"
}
