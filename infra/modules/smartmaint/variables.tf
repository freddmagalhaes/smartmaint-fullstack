variable "environment" {
  description = "Nome do ambiente (staging ou production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Use staging ou production."
  }
}

variable "region" {
  description = "Região AWS"
  type        = string
  default     = "sa-east-1"
}

variable "domain_name" {
  description = "Domínio do sistema (ex.: app.smartmaint.com.br)"
  type        = string
}

variable "route53_zone_id" {
  description = "ID da zona hospedada no Route 53 que contém o domínio (certificado e DNS automáticos)"
  type        = string
}

variable "email_domain" {
  description = "Domínio usado como remetente dos e-mails (ex.: smartmaint.com.br); precisa estar na mesma zona do Route 53"
  type        = string
}

variable "email_from" {
  description = "Endereço remetente (ex.: no-reply@smartmaint.com.br)"
  type        = string
}

variable "alert_emails" {
  description = "E-mails que recebem alarmes (indisponibilidade, erros, banco) e alertas de custo"
  type        = list(string)
}

# --- Rede ---
variable "vpc_cidr" {
  description = "Faixa de IPs da VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "nat_gateway_per_az" {
  description = "Um NAT Gateway por zona (alta disponibilidade, custo maior). false = um único NAT"
  type        = bool
  default     = true
}

# --- Aplicação ---
variable "image_tag" {
  description = "Tag da imagem na definição criada pelo Terraform. Ela só serve de modelo: o pipeline de deploy troca a imagem pela do commit"
  type        = string
  default     = "aguardando-primeiro-deploy"
}

variable "task_cpu" {
  description = "CPU por container (unidades Fargate: 256, 512, 1024...)"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Memória por container em MiB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Quantidade mínima de containers (2 = sem parada se uma zona cair)"
  type        = number
  default     = 2
}

variable "max_count" {
  description = "Máximo de containers no escalonamento automático"
  type        = number
  default     = 6
}

variable "app_environment" {
  description = "Variáveis de ambiente extras da aplicação (não secretas)"
  type        = map(string)
  default     = {}
}

# --- Banco de dados ---
variable "db_instance_class" {
  description = "Classe da instância RDS"
  type        = string
  default     = "db.t4g.small"
}

variable "db_allocated_storage" {
  description = "Armazenamento inicial do banco (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Limite do crescimento automático do armazenamento (GB)"
  type        = number
  default     = 200
}

variable "db_multi_az" {
  description = "Banco com réplica em outra zona (failover automático)"
  type        = bool
  default     = true
}

variable "db_backup_retention_days" {
  description = "Dias de retenção dos backups automáticos (1 a 35)"
  type        = number
  default     = 14
}

variable "db_deletion_protection" {
  description = "Impede excluir o banco por engano"
  type        = bool
  default     = true
}

# --- Proteções ---
variable "enable_waf" {
  description = "Firewall de aplicação (regras gerenciadas da AWS + limite por IP)"
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "Máximo de requisições por IP a cada 5 minutos antes do bloqueio"
  type        = number
  default     = 3000
}

variable "monthly_budget_usd" {
  description = "Orçamento mensal (USD) para o alerta de custo"
  type        = number
  default     = 400
}

# --- Deploy pelo GitHub Actions ---
variable "github_oidc_provider_arn" {
  description = "ARN do provedor OIDC do GitHub (saída do bootstrap)"
  type        = string
}

variable "github_repository" {
  description = "Repositório no formato dono/nome"
  type        = string
}

variable "github_environment" {
  description = "Environment do GitHub autorizado a fazer deploy neste ambiente"
  type        = string
}
