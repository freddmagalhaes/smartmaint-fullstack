# 🛠️ SmartMaint - Gestão Inteligente de Manutenção

SmartMaint é uma plataforma SaaS para gestão de ativos e manutenção industrial: ordens de serviço, planos preventivos, estoque, registro de falhas, análise FMEA e indicadores de confiabilidade (MTBF, MTTR, disponibilidade e R(t)), com isolamento de dados por cliente (multi-tenant), backoffice de contratos e cobrança online.

## 🚀 Funcionalidades

- **📊 Dashboard:** disponibilidade, MTBF, taxa de falha, O.S. ativas e histórico de falhas e horas de reparo.
- **📋 Ordens de Serviço:** abertura, execução, pausa e conclusão com tempo real de reparo; impressão da O.S.
- **⚙️ Equipamentos:** cadastro com foto e status de manutenção.
- **📅 Planos Preventivos:** intervalos recorrentes, vencimentos e registro de execução.
- **📦 Estoque:** peças, estoque mínimo e valores.
- **⚠️ Falhas e Reparos:** histórico usado nos indicadores.
- **🔍 FMEA:** RPN (Severidade × Ocorrência × Detecção).
- **📈 Simulador R(t):** confiabilidade por equipamento.
- **🏢 Backoffice:** clientes, contratos, faturas, equipe de suporte e acesso assistido aos dados do cliente.
- **💳 Cobrança:** pagamento via Stripe (cartão e boleto), baixa automática por webhook e bloqueio de inadimplentes.

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

Recomendações para produção:

- **Banco:** RDS MySQL 8 com backup automático (retenção mínima de 7 dias) e `DB_SSL=rds` (conexão criptografada).
- **Arquivos:** defina `S3_BUCKET` (o disco do container é perdido a cada deploy). A role da aplicação precisa de `s3:PutObject` e `s3:GetObject`.
- **HTTPS:** termine o TLS no ALB/CloudFront, defina `TRUST_PROXY=1` e `FORCE_HTTPS=true`.
- **Segredos:** `JWT_SECRET` (mínimo de 32 caracteres), credenciais de banco, SMTP e Stripe via Secrets Manager/SSM, nunca na imagem.
- **Stripe:** cadastre o webhook `https://SEU_DOMINIO/api/billing/webhook` com os eventos `checkout.session.completed` e `checkout.session.async_payment_succeeded`.
- **Logs e alarmes:** CloudWatch para os logs do container e alarme no health check.

O `Dockerfile.api` gera apenas a API, para quem hospeda o frontend separadamente.

## 📄 Licença

Software proprietário. Todos os direitos reservados. Consulte o arquivo [LICENSE](LICENSE).
