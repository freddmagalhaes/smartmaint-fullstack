variable "region" {
  type    = string
  default = "sa-east-1"
}

variable "domain_name" {
  description = "Domínio do sistema neste ambiente"
  type        = string
}

variable "route53_zone_id" {
  description = "ID da zona hospedada no Route 53"
  type        = string
}

variable "email_domain" {
  description = "Domínio dos e-mails enviados"
  type        = string
}

variable "email_from" {
  description = "Remetente dos e-mails"
  type        = string
}

variable "alert_emails" {
  description = "Quem recebe alarmes e alertas de custo"
  type        = list(string)
}

variable "github_oidc_provider_arn" {
  description = "Saída github_oidc_provider_arn do bootstrap"
  type        = string
}

variable "github_repository" {
  type    = string
  default = "freddmagalhaes/smartmaint-fullstack"
}

variable "monthly_budget_usd" {
  type = number
}

variable "app_environment" {
  description = "Variáveis extras da aplicação (ex.: NFSE_ENABLED, NFSE_AMBIENTE). Segredos vão no Secrets Manager"
  type        = map(string)
  default     = {}
}
