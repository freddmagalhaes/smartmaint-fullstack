# 🛠️ SmartMaint - Gestão Inteligente de Manutenção

SmartMaint é uma plataforma SaaS para gestão de ativos e manutenção industrial: ordens de serviço, planos preventivos, estoque, registro de falhas, análise FMEA e indicadores de confiabilidade (MTBF, MTTR, disponibilidade e R(t)), com isolamento de dados por cliente (multi-tenant), backoffice de contratos e cobrança online.

## 🚀 Funcionalidades

- **📊 Dashboard:** disponibilidade, MTBF, taxa de falha, O.S. ativas e histórico de falhas e horas de reparo.
- **📑 Relatórios gerenciais:** por período e unidade: O.S. por tipo/status/prioridade e tempo médio de solução, cumprimento das preventivas, custo de peças por mês, MTTR/MTBF/disponibilidade por equipamento e histórico de cada equipamento. Exporta em Excel e imprime/salva em PDF.
- **🚀 Primeiros passos:** checklist no Dashboard do administrador do cliente novo (dados da empresa, equipamentos, preventiva, primeira O.S., estoque e equipe), com o progresso real.
- **📋 Ordens de Serviço:** abertura, execução, pausa e conclusão com tempo real de reparo; checklist, peças com baixa automática no estoque, fotos/anexos, comentários e impressão da O.S.
- **⚙️ Equipamentos:** cadastro com foto e status de manutenção.
- **📅 Planos Preventivos:** geram a O.S. automaticamente no vencimento (com antecedência configurável) e checklist padrão; concluir a O.S. recalcula o próximo vencimento.
- **📦 Estoque:** peças por unidade ou compartilhadas, estoque mínimo, entrada, ajuste por contagem e histórico de movimentações; custo de peças por O.S. e por equipamento.
- **📥 Importação:** equipamentos por planilha Excel (.xlsx) ou CSV, com pré-visualização e erros por linha.
- **✉️ Notificações por e-mail:** O.S. crítica, preventiva gerada, estoque abaixo do mínimo, fatura vencendo e em atraso (cada aviso uma única vez; o usuário pode desligar no perfil).
- **⚠️ Falhas e Reparos:** histórico usado nos indicadores.
- **🔍 FMEA:** RPN (Severidade × Ocorrência × Detecção).
- **📈 Simulador R(t):** confiabilidade por equipamento.
- **🏭 Unidades fabris:** várias plantas ou filiais por cliente, com filtro por unidade em todas as telas.
- **🏢 Backoffice:** clientes, contratos, faturas, planos e limites, dados fiscais, equipe de suporte e acesso assistido aos dados do cliente.
- **🧾 Auditoria:** histórico de acessos e alterações por cliente.
- **💳 Assinatura mensal:** cartão recorrente com 30 dias grátis, boleto e Pix (Pix Automático quando disponível), troca de plano, cancelamento, baixa automática por webhook e bloqueio de inadimplentes.

## 👥 Perfis de acesso

As permissões são aplicadas no backend (a interface apenas esconde o que o perfil não pode usar).

| Perfil | Acesso |
|---|---|
| **Root** (`is_master`) | Tudo, incluindo exclusão de clientes e equipe de suporte |
| **Suporte** | Backoffice (clientes, contratos, faturas) e dados de qualquer cliente |
| **Administrador** | Todos os módulos do próprio cliente, equipe, dados da empresa e faturamento |
| **Gerente** | Operação do próprio cliente (equipamentos, O.S., preventivas, estoque, falhas, simulador) |
| **Usuário** | Abre e acompanha ordens de serviço |

## 🛡️ Segurança

- Senhas com `bcrypt`; mínimo de 8 caracteres; contas novas recebem **convite por e-mail** (não existe senha padrão).
- JWT revalidado a cada requisição: troca de senha, exclusão de usuário e bloqueio do cliente têm efeito imediato.
- Isolamento multi-tenant no backend: o `tenant_id` vem do token (clientes) e todo vínculo entre registros é validado.
- Validação de entrada com `zod` em todas as rotas; queries parametrizadas (`mysql2`).
- `helmet` com Content Security Policy, rate limit geral e específico para login e recuperação de senha.
- Uploads verificados pelo conteúdo do arquivo (PNG, JPG, WEBP, PDF), nomes aleatórios e separados por cliente.
- Webhook do Stripe autenticado por assinatura.
- Log de auditoria (logins, falhas de login, criação, alteração e exclusão), sem gravar senhas.

## 📐 Planos e limites

Os planos (`Starter`, `Pro`, `Enterprise`) ficam na tabela `plans` e são editados pelo Root em **Backoffice → Planos**: preço mensal, dias de teste e limites de usuários, equipamentos e unidades (em branco = ilimitado). Ao atingir o limite, a criação é bloqueada com a mensagem do plano (`403 PLAN_LIMIT`), e o administrador do cliente vê o uso em **Configurações → Faturamento**. Os valores iniciais são provisórios.

## 💳 Assinatura e cobrança

O administrador do cliente assina em **Configurações → Faturamento**, escolhendo o plano e a forma de pagamento:

| Forma | Como cobra | Teste grátis |
|---|---|---|
| Cartão de crédito | Assinatura no Stripe, cobrada automaticamente todo mês | Sim (dias do plano, uma vez por cliente) |
| Pix Automático | Assinatura no Stripe com autorização no app do banco | Sim. Fica oculto até `STRIPE_PIX_AUTOMATICO=true` |
| Boleto | O SmartMaint gera a fatura do mês `BILLING_INVOICE_LEAD_DAYS` antes do vencimento; o cliente paga pelo Checkout | Não |
| Pix | Igual ao boleto, com QR Code Pix | Não |

- O valor é o `valor_mensal` negociado no contrato do cliente ou, se vazio, o preço do plano.
- Cada cobrança do Stripe vira uma fatura no histórico; fatura paga entra na fila da NFS-e.
- Cartão recusado: a fatura fica "Atrasada", o Stripe tenta cobrar de novo e o cliente pode trocar o cartão em **Gerenciar pagamento** (portal do Stripe). Depois de `BILLING_GRACE_DAYS`, o acesso é bloqueado.
- Troca de plano: no cartão a diferença é proporcional; no boleto/Pix vale a partir da próxima fatura. Não é possível trocar para um plano menor que o uso atual.
- Cancelamento: no cartão vale no fim do período pago; no boleto/Pix as faturas param de ser geradas.

No Stripe: cadastre o webhook `https://SEU_DOMINIO/api/billing/webhook` com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid` e `invoice.payment_failed`. Em **Settings → Billing → Customer portal**, ative a troca de forma de pagamento e o cancelamento. Em **Settings → Billing → Subscriptions and emails**, ative as novas tentativas automáticas (Smart Retries) e os e-mails de cartão recusado.

## 📝 Cadastro, Termos de Uso e LGPD

- **Cadastro pelo próprio cliente** (`/cadastro`): a empresa informa nome, e-mail e senha, aceita os documentos e recebe um link de confirmação (válido por 48 h). Confirmado o e-mail, a conta fica **Pendente**: só o faturamento fica acessível até a assinatura (cartão com teste grátis) ou o primeiro pagamento (boleto/Pix). Proteções: limite de cadastros por IP, campo invisível contra robôs e resposta igual para e-mails já cadastrados. Contas que nunca assinam são apagadas após `SIGNUP_PENDING_RETENTION_DAYS` (30). Desligue com `SIGNUP_ENABLED=false`. Em produção o cadastro exige SMTP.
- **Termos de Uso** (`/termos`) e **Política de Privacidade** (`/privacidade`): textos em `src/pages/legal`, com os dados da empresa vindos de `LEGAL_COMPANY_NAME`, `LEGAL_CNPJ`, `LEGAL_ADDRESS`, `LEGAL_CONTACT_EMAIL` e `LEGAL_DPO_NAME`. **Os textos são uma minuta: revise com um advogado antes de vender.**
- **Aceite**: todo usuário de cliente aceita a versão vigente no primeiro acesso (até lá a API responde `403 LEGAL_ACCEPTANCE_REQUIRED`). Cada aceite fica registrado com data, IP e navegador (`legal_acceptances`). Ao alterar os textos, mude `LEGAL_VERSION` em `server/utils/legal.js`: todos aceitam de novo.
- **Exportação**: o Administrador baixa todos os dados da empresa em planilha (.xlsx) em **Configurações → Empresa** (portabilidade). A exportação fica no log de auditoria.
- **Exclusão após o cancelamento**: os Termos prometem excluir os dados até 90 dias após o cancelamento (ou antes, a pedido). Faça isso em **Backoffice → Clientes → Excluir** (apenas o Root).

## 🧾 NFS-e (Emissor Nacional)

A emissão segue o padrão nacional (Sefin Nacional). O ambiente já está preparado:

1. **Backoffice → Fiscal (NFS-e)**: dados do prestador (CNPJ, inscrição municipal, código IBGE do município, regime, código de tributação, alíquota de ISS e descrição do serviço) e um checklist do que falta.
2. **Variáveis de ambiente**: certificado A1 em `NFSE_CERT_BASE64` (ou `NFSE_CERT_PATH`) e `NFSE_CERT_PASSWORD`, além de `NFSE_AMBIENTE` (`homologacao` ou `producao`). O certificado nunca é enviado pela interface.
3. **Dados do tomador**: cada cliente preenche razão social, CNPJ e endereço em **Configurações → Empresa**.
4. **Fila**: toda fatura paga gera uma NFS-e `Pendente`. A transmissão ao Emissor Nacional é ativada (`NFSE_ENABLED=true`) quando houver CNPJ, certificado e confirmação de que o município aderiu ao padrão nacional.

## 📈 Logs e monitoramento

- Logs da API em JSON (uma linha por evento, pronto para CloudWatch Logs Insights), com `X-Request-Id` em toda resposta para rastrear uma requisição de ponta a ponta. Senhas e tokens são mascarados.
- Sentry opcional: `SENTRY_DSN` no backend e `VITE_SENTRY_DSN` no build do frontend (`docker build --build-arg VITE_SENTRY_DSN=...`).

## 🛠️ Tecnologias

- **Frontend:** React 19, Vite, React Router, Recharts, Lucide.
- **Backend:** Node.js 22+, Express 5, MySQL 8, zod, Stripe, Nodemailer, AWS S3 (opcional).
- **Testes:** `node:test` + `supertest` (integração com banco real).

## 📦 Rodando localmente

Pré-requisitos: Node.js 22+ e MySQL 8 (ou MariaDB 10.6+).

```bash
# 1. Dependências (o postinstall também instala as do backend)
npm install

# 2. Banco de dados
mysql -u root -p -e "CREATE DATABASE smartmaint_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 3. Configuração: copie e preencha (JWT_SECRET e DB_* são obrigatórios)
cp server/.env.example server/.env

# 4. Cria as tabelas e o usuário Root (as tabelas também são criadas ao iniciar o servidor)
MASTER_EMAIL=voce@empresa.com MASTER_PASSWORD='uma-senha-forte' npm --prefix server run seed
#    opcional: cliente de demonstração
MASTER_EMAIL=... MASTER_PASSWORD=... DEMO_PASSWORD='outra-senha' npm --prefix server run seed -- --demo

# 5. Em dois terminais
npm --prefix server run dev   # API em http://localhost:3001
npm run dev                   # Frontend em http://localhost:5173
```

Sem SMTP configurado, os e-mails (convites e recuperação de senha) são impressos no console do backend em desenvolvimento.

### Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint do frontend |
| `npm run build` | Build de produção do frontend (`dist/`) |
| `npm test` | Testes de integração da API (precisa de um MySQL acessível; usa o banco `smartmaint_test`) |
| `npm --prefix server run migrate` | Aplica as migrations pendentes |
| `NEW_PASSWORD='...' npm --prefix server run set-password -- email@x.com` | Redefine a senha de um usuário pelo terminal |

## 🗄️ Banco de dados e migrations

O schema é versionado em `server/migrations/` e aplicado automaticamente ao iniciar o servidor (desative com `RUN_MIGRATIONS=false` se preferir rodar `npm --prefix server run migrate` no pipeline de deploy).

**Atualizando uma instalação antiga** (criada com o antigo `database.sql`): basta iniciar a nova versão. As migrations preservam os dados e:

- adicionam os perfis `Gerente` e `Suporte`, colunas de revogação de sessão, tempo de reparo das O.S. e baixa de faturas;
- **bloqueiam contas que ainda usam a senha padrão `123456`** (inclusive `master@smartmaint.com`). Use "Esqueci minha senha" ou `npm --prefix server run set-password` para definir uma nova senha.

## ☁️ Deploy (AWS)

O `Dockerfile` gera uma imagem única (frontend + API) que roda como usuário sem privilégios, com health check em `/api/health`:

```bash
docker build -t smartmaint .
docker run -p 3001:3001 --env-file server/.env smartmaint
```

A infraestrutura completa (rede, ECS Fargate, RDS, S3, SES, WAF, alarmes) está em Terraform na pasta
[`infra/`](infra/README.md), com deploy automático pelo GitHub Actions (`.github/workflows/deploy.yml`).
O passo a passo para criar o ambiente está em [`infra/README.md`](infra/README.md).

Recomendações para produção (já aplicadas pelo Terraform):

- **Banco:** RDS MySQL 8 com backup automático (retenção mínima de 7 dias) e `DB_SSL=rds` (conexão criptografada).
- **Arquivos:** defina `S3_BUCKET` (o disco do container é perdido a cada deploy). A role da aplicação precisa de `s3:PutObject` e `s3:GetObject`.
- **HTTPS:** termine o TLS no ALB/CloudFront, defina `TRUST_PROXY=1` e `FORCE_HTTPS=true`.
- **Segredos:** `JWT_SECRET` (mínimo de 32 caracteres), credenciais de banco, SMTP e Stripe via Secrets Manager/SSM, nunca na imagem.
- **Stripe:** cadastre o webhook `https://SEU_DOMINIO/api/billing/webhook` com os eventos listados em [Assinatura e cobrança](#-assinatura-e-cobrança).
- **Logs e alarmes:** CloudWatch para os logs do container e alarme no health check.

O `Dockerfile.api` gera apenas a API, para quem hospeda o frontend separadamente.

## 📄 Licença

Software proprietário. Todos os direitos reservados. Consulte o arquivo [LICENSE](LICENSE).
