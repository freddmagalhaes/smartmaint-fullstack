# Alarmes por e-mail (SNS) e alerta de custo.
# Cada destinatário recebe um e-mail da AWS para confirmar a inscrição: confirme para receber os alarmes.

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alertas"
}

resource "aws_sns_topic_subscription" "alerts" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  alb_dims = { LoadBalancer = aws_lb.main.arn_suffix }
  tg_dims  = { LoadBalancer = aws_lb.main.arn_suffix, TargetGroup = aws_lb_target_group.app.arn_suffix }
  db_dims  = { DBInstanceIdentifier = aws_db_instance.main.identifier }

  alarms = {
    "app-fora-do-ar" = {
      description = "Nenhum container saudavel atendendo: sistema fora do ar"
      namespace   = "AWS/ApplicationELB", metric = "HealthyHostCount", stat = "Minimum"
      dims        = local.tg_dims, comparison = "LessThanThreshold", threshold = 1, periods = 2
      missing     = "breaching"
    }
    "erros-5xx" = {
      description = "Muitas respostas de erro do servidor (5xx)"
      namespace   = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum"
      dims        = local.tg_dims, comparison = "GreaterThanThreshold", threshold = 20, periods = 2
      missing     = "notBreaching"
    }
    "lentidao" = {
      description = "Tempo de resposta acima de 2 segundos (p95)"
      namespace   = "AWS/ApplicationELB", metric = "TargetResponseTime", stat = "p95"
      dims        = local.tg_dims, comparison = "GreaterThanThreshold", threshold = 2, periods = 3
      missing     = "notBreaching"
    }
    "banco-cpu" = {
      description = "CPU do banco acima de 80%"
      namespace   = "AWS/RDS", metric = "CPUUtilization", stat = "Average"
      dims        = local.db_dims, comparison = "GreaterThanThreshold", threshold = 80, periods = 3
      missing     = "notBreaching"
    }
    "banco-disco" = {
      description = "Menos de 5 GB livres no banco"
      namespace   = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum"
      dims        = local.db_dims, comparison = "LessThanThreshold", threshold = 5368709120, periods = 1
      missing     = "notBreaching"
    }
    "banco-memoria" = {
      description = "Menos de 100 MB de memoria livre no banco"
      namespace   = "AWS/RDS", metric = "FreeableMemory", stat = "Minimum"
      dims        = local.db_dims, comparison = "LessThanThreshold", threshold = 104857600, periods = 3
      missing     = "notBreaching"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "main" {
  for_each            = local.alarms
  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dims
  extended_statistic  = startswith(each.value.stat, "p") ? each.value.stat : null
  statistic           = startswith(each.value.stat, "p") ? null : each.value.stat
  period              = 300
  evaluation_periods  = each.value.periods
  comparison_operator = each.value.comparison
  threshold           = each.value.threshold
  treat_missing_data  = each.value.missing
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Erros registrados pela aplicação (logs JSON com level >= 50)
resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  name           = "${local.name}-erros"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.level >= 50 }"
  metric_transformation {
    name      = "AppErrors"
    namespace = "SmartMaint/${var.environment}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  alarm_name          = "${local.name}-erros-aplicacao"
  alarm_description   = "Erros registrados pela aplicacao (ver CloudWatch Logs ou Sentry)"
  namespace           = "SmartMaint/${var.environment}"
  metric_name         = "AppErrors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Alerta de custo: aviso ao atingir 80% do orçamento e se a previsão do mês passar de 100%
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-mensal"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }
}
