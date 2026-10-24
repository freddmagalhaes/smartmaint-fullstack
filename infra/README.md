# Infraestrutura AWS do SmartMaint

Toda a infraestrutura é criada pelo Terraform a partir desta pasta. Os deploys são feitos pelo
GitHub Actions a cada commit na `main` que passa no CI. Não há chaves de acesso fixas: o GitHub
assume um papel na AWS via OIDC.

```
Internet ─► Route 53 ─► WAF ─► ALB (HTTPS, TLS 1.2+) ─► ECS Fargate (2+ containers, subnets privadas)
                                                            │
                         RDS MySQL 8 (Multi-AZ, criptografado, backups) ◄┤
                         S3 (fotos e anexos)                             ◄┤
                         Secrets Manager (senhas, Stripe, NFS-e)         ◄┤
                         SES (e-mails)                                   ◄┘
CloudWatch (logs, alarmes por e-mail) · AWS Budgets (alerta de custo) · ECR (imagens)
```

| Pasta | Conteúdo |
|---|---|
| `bootstrap/` | Bucket do estado do Terraform e provedor OIDC do GitHub (uma vez por conta) |
| `modules/smartmaint/` | Toda a infraestrutura de um ambiente |
| `envs/staging/` | Homologação: 1 container, banco simples, 1 NAT |
| `envs/production/` | Produção: 2 a 6 containers, banco Multi-AZ, NAT por zona, proteção contra exclusão |
| `scripts/ecs-run.sh` | Comandos avulsos no ambiente (criar usuário Root, trocar senha) |

## Custo estimado (região São Paulo, sa-east-1)

Valores aproximados. Confira na [calculadora da AWS](https://calculator.aws/) antes de definir preços.

| Item | Produção | Homologação |
|---|---|---|
| NAT Gateway | ~US$ 140 (2) | ~US$ 70 (1) |
| RDS MySQL | ~US$ 100 (t4g.small Multi-AZ) | ~US$ 25 (t4g.micro) |
| ECS Fargate | ~US$ 65 (2 × 0,5 vCPU/1 GB) | ~US$ 16 |
| ALB | ~US$ 40 | ~US$ 35 |
| WAF, CloudWatch, Secrets, S3, ECR | ~US$ 40 | ~US$ 25 |
| **Total** | **~US$ 385/mês** | **~US$ 170/mês** |

Tráfego de saída e e-mails (SES: US$ 0,10 por mil) são cobrados à parte. O alerta de custo
(`monthly_budget_usd`) avisa por e-mail ao atingir 80% do valor e se a previsão do mês passar de 100%.
Para economizar no início, dá para publicar direto em produção sem homologação (veja o passo 6).

## Pré-requisitos

- [Terraform](https://developer.hashicorp.com/terraform/install) 1.10 ou mais novo e
  [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
- Um domínio (ex.: `smartmaint.com.br`, registrado no Registro.br).
- Acesso de administrador ao repositório no GitHub.

## 1. Contas AWS (boas práticas)

1. Crie a conta principal da AWS e ative o MFA do usuário root. Depois disso, não use mais o root no dia a dia.
2. Em **AWS Organizations**, crie duas contas-membro: `smartmaint-production` e `smartmaint-staging`.
   Contas separadas isolam os clientes reais dos testes e separam os custos.
3. Em **IAM Identity Center**, crie seu usuário com MFA e dê a ele o conjunto de permissões
   `AdministratorAccess` nas duas contas.
4. No terminal: `aws configure sso` (uma vez para cada conta, com perfis `smartmaint-prod` e
   `smartmaint-staging`). Antes de cada comando abaixo, escolha a conta:
   `export AWS_PROFILE=smartmaint-prod` (ou `smartmaint-staging`).

## 2. DNS no Route 53

1. Na conta de **produção**: Route 53 > Hosted zones > Create hosted zone > `smartmaint.com.br`.
2. No Registro.br, troque os servidores DNS do domínio pelos 4 servidores `NS` mostrados pela zona.
3. Homologação (se for usar): na conta de **homologação** crie a zona `homolog.smartmaint.com.br`.
   Copie os 4 servidores `NS` dela e, na zona de produção, crie um registro `NS` chamado `homolog`
   com esses 4 valores.
4. Anote o **Hosted zone ID** de cada zona (ex.: `Z0123456789ABCDEFGHIJ`).

## 3. Bootstrap (uma vez em cada conta)

```bash
export AWS_PROFILE=smartmaint-prod
cd infra/bootstrap
terraform init
terraform apply -var="state_bucket_name=smartmaint-tfstate-$(aws sts get-caller-identity --query Account --output text)"
```

Anote as saídas `state_bucket` e `github_oidc_provider_arn`. Repita na conta de homologação.

## 4. Criar o ambiente

```bash
cd infra/envs/production          # ou infra/envs/staging
cp backend.hcl.example backend.hcl            # preencha o bucket do passo 3
cp terraform.tfvars.example terraform.tfvars  # preencha domínio, zona, e-mails e o ARN do OIDC
terraform init -backend-config=backend.hcl
terraform plan -out=plano.tfplan
terraform apply plano.tfplan
```

A criação leva cerca de 20 minutos (o banco Multi-AZ é a parte mais demorada). Na primeira
execução, faça commit do arquivo `.terraform.lock.hcl` gerado em cada pasta: ele fixa as versões
dos provedores. `backend.hcl` e `terraform.tfvars` ficam fora do Git.

Depois do `apply`:

- **Confirme os e-mails** "AWS Notification - Subscription Confirmation" recebidos em `alert_emails`.
  Sem isso, os alarmes não chegam.
- O serviço ainda não tem imagem: ele fica parado até o primeiro deploy (passo 6). Até lá, o alarme
  "app-fora-do-ar" pode disparar. É esperado.

## 5. Sair do sandbox do SES

Contas novas só enviam e-mail para endereços verificados. No console da conta de produção:
**Amazon SES > Account dashboard > Request production access**. Informe que são e-mails
transacionais (convites, recuperação de senha, avisos de O.S. e cobrança) e que os destinatários são
usuários cadastrados pelos próprios clientes. A aprovação costuma levar até 1 dia útil.

## 6. GitHub: environments e deploy

Em **Settings > Environments**, crie `staging` e `production`. Em `production`, marque
**Required reviewers** (você). Assim, toda publicação em produção espera a sua aprovação.
Em **Deployment branches**, deixe apenas `main`.

Em cada environment, crie estas **variables** com os valores de `terraform output`:

| Variável | Valor |
|---|---|
| `AWS_REGION` | `sa-east-1` |
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw deploy_role_arn` |
| `ECR_REPOSITORY_URL` | `terraform output -raw ecr_repository_url` |
| `ECS_CLUSTER` | `terraform output -raw ecs_cluster` |
| `ECS_SERVICE` | `terraform output -raw ecs_service` |
| `ECS_TASK_FAMILY` | `terraform output -raw task_family` |
| `CONTAINER_NAME` | `terraform output -raw container_name` |
| `APP_URL` | `terraform output -raw app_url` |

Opcionais, em **Settings > Secrets and variables > Actions > Variables** (nível do repositório):

- `VITE_SENTRY_DSN`: DSN do Sentry do frontend.
- `DEPLOY_STAGING=false`: publica direto em produção, sem passar por homologação.

Para publicar: faça merge na `main`. Quando o CI passa, o workflow **Deploy** constrói a imagem,
publica em homologação, verifica se o sistema responde e espera a aprovação para produção.
O deploy também pode ser iniciado manualmente em **Actions > Deploy > Run workflow**. Use isso no
primeiro deploy e depois de mudanças de configuração feitas pelo Terraform.

Cada versão nova só substitui a anterior depois de ficar saudável. Se falhar, o ECS volta sozinho
para a versão anterior. As migrações do banco rodam automaticamente quando o container inicia.

## 7. Usuário Root (primeiro acesso)

O banco fica em rede privada. O script abaixo executa o comando dentro do ambiente, com a mesma
imagem e os mesmos segredos do sistema:

```bash
export AWS_PROFILE=smartmaint-prod
MASTER_EMAIL=voce@suaempresa.com.br MASTER_PASSWORD='uma-senha-forte' \
  infra/scripts/ecs-run.sh production node server/scripts/seed.js
```

A senha fica visível nos detalhes da tarefa no console da AWS. **Troque-a no primeiro acesso.**
Para redefinir uma senha sem e-mail:

```bash
NEW_PASSWORD='nova-senha' infra/scripts/ecs-run.sh production node server/scripts/set-password.js voce@suaempresa.com.br
```

## 8. Segredos: Stripe, Sentry e NFS-e

O Terraform cria o segredo `smartmaint-<ambiente>/app` no Secrets Manager. Banco, JWT e SMTP já vêm
preenchidos. Os demais começam vazios (a integração fica desligada) e são editados pelo console:
**Secrets Manager > smartmaint-production/app > Retrieve secret value > Edit**.

| Chave | Onde obter |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe > Developers > API keys (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe > Developers > Webhooks > Add endpoint `https://<domínio>/api/billing/webhook`, com os eventos listados no README principal, seção "Assinatura e cobrança" (`whsec_...`) |
| `SENTRY_DSN` | Sentry > Project settings > Client keys |
| `NFSE_CERT_BASE64` | Certificado A1 (.pfx) em base64: `base64 -w0 certificado.pfx` |
| `NFSE_CERT_PASSWORD` | Senha do certificado A1 |

Para ligar a emissão de NFS-e depois de cadastrar o certificado, inclua no `terraform.tfvars`:

```hcl
app_environment = {
  NFSE_ENABLED  = "true"
  NFSE_AMBIENTE = "producao"   # use "homologacao" para os testes
}
```

Depois rode `terraform apply`. O ECS lê os segredos quando o container inicia, então qualquer
mudança (no segredo ou no `terraform.tfvars`) só vale após um novo deploy: **Actions > Deploy > Run workflow**.

## Operação

- **Logs**: CloudWatch > Log groups > `/smartmaint/production/app` (JSON, com `requestId`).
- **Alarmes** (por e-mail): sistema fora do ar, erros 5xx, lentidão, erros da aplicação, CPU,
  disco e memória do banco.
- **Backups**: snapshots diários do RDS (14 dias em produção), com restauração para qualquer
  momento nesse período (RDS > Automated backups > Restore to point in time). Arquivos apagados no
  S3 podem ser recuperados por 30 dias (versionamento).
- **Voltar uma versão**: ECS > serviço > Update service > escolha a revisão anterior da definição de
  tarefa. As 30 imagens mais recentes ficam guardadas no ECR.
- **Escala**: o número de containers sobe sozinho com o uso de CPU (até `max_count`).
- **Validação local** (sem conta AWS): `terraform fmt -check -recursive infra` e, em
  `infra/modules/smartmaint`, `terraform init -backend=false && terraform test`. O CI roda os dois.
