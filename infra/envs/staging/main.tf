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
  # Bucket e chave vêm de backend.hcl (terraform init -backend-config=backend.hcl)
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "smartmaint", Environment = "staging", ManagedBy = "terraform" }
  }
}

module "smartmaint" {
  source = "../../modules/smartmaint"

  environment              = "staging"
  region                   = var.region
  domain_name              = var.domain_name
  route53_zone_id          = var.route53_zone_id
  email_domain             = var.email_domain
  email_from               = var.email_from
  alert_emails             = var.alert_emails
  github_oidc_provider_arn = var.github_oidc_provider_arn
  github_repository        = var.github_repository
  github_environment       = "staging"
  monthly_budget_usd       = var.monthly_budget_usd
  app_environment          = var.app_environment

  # Homologação: mesma arquitetura com tamanho e redundância reduzidos (custo menor)
  vpc_cidr                 = "10.30.0.0/16"
  nat_gateway_per_az       = false
  desired_count            = 1
  max_count                = 2
  task_cpu                 = 256
  task_memory              = 512
  db_instance_class        = "db.t4g.micro"
  db_multi_az              = false
  db_backup_retention_days = 3
  db_deletion_protection   = false
}
