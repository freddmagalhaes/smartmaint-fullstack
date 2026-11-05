# E-mail transacional pelo Amazon SES (convites, recuperação de senha e notificações).
# O domínio é verificado com DKIM no Route 53; SPF e DMARC evitam que os e-mails caiam no spam.
# Atenção: contas novas começam no "sandbox" do SES. Peça a saída do sandbox no console
# (SES > Account dashboard > Request production access) antes de enviar para clientes.

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.email_domain
}

locals {
  # O SES sempre devolve 3 tokens; a lista reserva só é usada no plano simulado dos testes (tests/)
  dkim_tokens = coalescelist(
    flatten(aws_sesv2_email_identity.domain.dkim_signing_attributes[*].tokens),
    ["dkim-pendente-1", "dkim-pendente-2", "dkim-pendente-3"],
  )
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = var.route53_zone_id
  name    = "${local.dkim_tokens[count.index]}._domainkey.${var.email_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${local.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# MAIL FROM próprio: alinha o SPF com o domínio do remetente
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity   = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain = "mail.${var.email_domain}"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  zone_id = var.route53_zone_id
  name    = "mail.${var.email_domain}"
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  zone_id = var.route53_zone_id
  name    = "mail.${var.email_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# DMARC: criado só em produção (um por domínio). Comece em monitoramento (p=none).
resource "aws_route53_record" "dmarc" {
  count   = local.is_production ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "_dmarc.${var.email_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none; rua=mailto:${var.alert_emails[0]}"]
}

# Credencial SMTP do SES: usuário IAM que só pode enviar e-mail a partir do domínio verificado
resource "aws_iam_user" "ses_smtp" {
  name = "${local.name}-ses-smtp"
}

resource "aws_iam_user_policy" "ses_smtp" {
  user = aws_iam_user.ses_smtp.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "ses:SendRawEmail"
      Resource = "*"
      Condition = {
        StringLike = { "ses:FromAddress" = "*@${var.email_domain}" }
      }
    }]
  })
}

resource "aws_iam_access_key" "ses_smtp" {
  user = aws_iam_user.ses_smtp.name
}
