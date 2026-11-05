output "app_url" {
  description = "Endereço do sistema"
  value       = "https://${var.domain_name}"
}

output "ecr_repository_url" {
  description = "Repositório das imagens"
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.app.name
}

output "container_name" {
  value = local.container_name
}

output "deploy_role_arn" {
  description = "Configure como AWS_DEPLOY_ROLE_ARN no environment do GitHub"
  value       = aws_iam_role.deploy.arn
}

output "app_secret_name" {
  description = "Segredo a completar no Secrets Manager (Stripe, Sentry, NFS-e)"
  value       = aws_secretsmanager_secret.app.name
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "log_group" {
  value = aws_cloudwatch_log_group.app.name
}

output "task_family" {
  value = aws_ecs_task_definition.app.family
}

output "private_subnet_ids" {
  description = "Usadas por scripts/ecs-run.sh para tarefas avulsas (seed, troca de senha)"
  value       = aws_subnet.private[*].id
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}
