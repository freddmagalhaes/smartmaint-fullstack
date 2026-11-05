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
    tags = { Project = "smartmaint", Environment = "production", ManagedBy = "terraform" }
  }
}

module "smartmaint" {
  source = "../../modules/smartmaint"

  environment              = "production"
  region                   = var.region
  domain_name              = var.domain_name
  route53_zone_id          = var.route53_zone_id
  email_domain             = var.email_domain
  email_from               = var.email_from
  alert_emails             = var.alert_emails
  github_oidc_provider_arn = var.github_oidc_provider_arn
  github_repository        = var.github_repository
  github_environment       = "production"
  monthly_budget_usd       = var.monthly_budget_usd
  app_environment          = var.app_environment

  # Produção: 2+ containers em zonas diferentes, banco Multi-AZ e backups de 14 dias
  vpc_cidr                 = "10.20.0.0/16"
  nat_gateway_per_az       = true
  desired_count            = 2
  max_count                = 6
  task_cpu                 = 512
  task_memory              = 1024
  db_instance_class        = "db.t4g.small"
  db_multi_az              = true
  db_backup_retention_days = 14
  db_deletion_protection   = true
}
