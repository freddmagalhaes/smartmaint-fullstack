# Plano completo do módulo sem conta AWS (provedores simulados).
# Executar: terraform init -backend=false && terraform test   (na pasta infra/modules/smartmaint)

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["sa-east-1a", "sa-east-1b", "sa-east-1c"] }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_elb_service_account" {
    defaults = { arn = "arn:aws:iam::507241528517:root" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

mock_provider "random" {}


variables {
  domain_name              = "app.exemplo.com.br"
  route53_zone_id          = "Z0000000000000000000"
  email_domain             = "exemplo.com.br"
  email_from               = "SmartMaint <nao-responda@exemplo.com.br>"
  alert_emails             = ["alertas@exemplo.com.br"]
  github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
  github_repository        = "freddmagalhaes/smartmaint-fullstack"
}

run "producao" {
  command = plan

  variables {
    environment        = "production"
    github_environment = "production"
  }

  assert {
    condition     = aws_db_instance.main.multi_az && aws_db_instance.main.deletion_protection
    error_message = "Banco de produção precisa ser Multi-AZ e protegido contra exclusão"
  }
  assert {
    condition     = length(aws_nat_gateway.main) == 2
    error_message = "Produção usa um NAT por zona"
  }
  assert {
    condition     = length(aws_wafv2_web_acl.main) == 1
    error_message = "WAF deve estar ativo"
  }
}

run "homologacao" {
  command = plan

  variables {
    environment            = "staging"
    github_environment     = "staging"
    nat_gateway_per_az     = false
    db_multi_az            = false
    db_deletion_protection = false
    desired_count          = 1
  }

  assert {
    condition     = length(aws_nat_gateway.main) == 1
    error_message = "Homologação usa um único NAT"
  }
}

run "ambiente_invalido" {
  command = plan
  variables {
    environment        = "dev"
    github_environment = "dev"
  }
  expect_failures = [var.environment]
}
