# Executado UMA vez em cada conta AWS (homologação e produção), antes dos ambientes.
# Cria o bucket do estado do Terraform e o provedor OIDC do GitHub (deploy sem chaves fixas).
#
#   cd infra/bootstrap
#   terraform init
#   terraform apply -var="state_bucket_name=smartmaint-tfstate-<id-da-conta>"

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "region" {
  description = "Região AWS"
  type        = string
  default     = "sa-east-1"
}

variable "state_bucket_name" {
  description = "Nome globalmente único do bucket do estado do Terraform (ex.: smartmaint-tfstate-123456789012)"
  type        = string
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "smartmaint", ManagedBy = "terraform", Component = "bootstrap" }
  }
}

# --- Estado remoto do Terraform (versionado, criptografado e privado) ---
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "state_tls_only" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# --- GitHub Actions autentica na AWS por OIDC (sem access keys guardadas no GitHub) ---
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

output "state_bucket" {
  description = "Use em envs/<ambiente>/backend.hcl"
  value       = aws_s3_bucket.state.bucket
}

output "github_oidc_provider_arn" {
  description = "Use na variável github_oidc_provider_arn do ambiente"
  value       = aws_iam_openid_connect_provider.github.arn
}
