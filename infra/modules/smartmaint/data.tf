# Banco de dados, arquivos enviados e segredos da aplicação.

# --- RDS MySQL 8 ---
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "mysql" {
  name   = "${local.name}-mysql8"
  family = "mysql8.0"

  # Acentuação correta (utf8mb4) e conexões sempre criptografadas
  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }
  parameter {
    name  = "collation_server"
    value = "utf8mb4_unicode_ci"
  }
  parameter {
    name  = "require_secure_transport"
    value = "1"
  }
}

# Senha gerada pelo Terraform e entregue à aplicação pelo Secrets Manager.
# (Sem rotação automática: a aplicação lê a senha só ao iniciar o container.)
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.db_instance_class

  db_name  = "smartmaint"
  username = "smartmaint"
  password = random_password.db.result
  port     = 3306

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  multi_az               = var.db_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.mysql.name
  publicly_accessible    = false

  backup_retention_period   = var.db_backup_retention_days
  backup_window             = "05:00-06:00" # 02h-03h em Brasília
  maintenance_window        = "sun:06:30-sun:07:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = !local.is_production
  final_snapshot_identifier = local.is_production ? "${local.name}-final" : null

  auto_minor_version_upgrade      = true
  performance_insights_enabled    = true
  enabled_cloudwatch_logs_exports = ["error", "slowquery"]
  apply_immediately               = !local.is_production
}

# --- S3: fotos, anexos e imagens dos equipamentos ---
resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name}-uploads-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "versoes-antigas"
    status = "Enabled"
    filter {}
    # Arquivo apagado ou substituído pode ser recuperado por 30 dias
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "uploads_tls_only" {
  bucket = aws_s3_bucket.uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# --- Segredos da aplicação (um único segredo JSON no Secrets Manager) ---
resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  description             = "Segredos do SmartMaint (${var.environment}). Preencha Stripe, Sentry e NFS-e pelo console."
  recovery_window_in_days = local.is_production ? 30 : 0
}

# Todas as chaves precisam existir (o ECS não inicia o container se faltar uma);
# valores vazios desligam a integração correspondente na aplicação.
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DB_USER               = aws_db_instance.main.username
    DB_PASSWORD           = random_password.db.result
    JWT_SECRET            = random_password.jwt.result
    SMTP_USER             = aws_iam_access_key.ses_smtp.id
    SMTP_PASS             = aws_iam_access_key.ses_smtp.ses_smtp_password_v4
    STRIPE_SECRET_KEY     = ""
    STRIPE_WEBHOOK_SECRET = ""
    SENTRY_DSN            = ""
    NFSE_CERT_BASE64      = ""
    NFSE_CERT_PASSWORD    = ""
  })

  # Depois de criado, o segredo é editado pelo console (Stripe, NFS-e...): o Terraform não sobrescreve
  lifecycle {
    ignore_changes = [secret_string]
  }
}

locals {
  secret_keys = [
    "DB_USER", "DB_PASSWORD", "JWT_SECRET", "SMTP_USER", "SMTP_PASS",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SENTRY_DSN", "NFSE_CERT_BASE64", "NFSE_CERT_PASSWORD",
  ]
}
