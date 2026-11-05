# 🛠️ SmartMaint - Gestão Inteligente de Manutenção

SmartMaint é uma plataforma moderna e intuitiva para o gerenciamento de ativos, manutenção industrial e análise de risco. Projetada para otimizar processos de manutenção preventiva, corretiva e preditiva, a aplicação oferece uma visão consolidada de indicadores de performance (KPIs) e suporte à metodologia FMEA.

## 🚀 Funcionalidades Principais

- **📊 Dashboard Estratégico:** Visualização de indicadores em tempo real.
- **📋 Ordens de Serviço:** Gestão completa do ciclo de vida das O.S. com exportação para PDF.
- **⚙️ Gestão de Ativos:** Cadastro e monitoramento de equipamentos por unidade (Tenant).
- **📅 Planos Preventivos:** Agendamento e controle de manutenções recorrentes.
- **📦 Gestão de Estoque:** Controle de peças e materiais para manutenções.
- **⚠️ Registro de Falhas:** Histórico detalhado de quebras e reparos.
- **🔍 Análise FMEA:** Identificação de modos de falha, efeitos e criticidade.
- **📈 Simulador R(t):** Cálculo de confiabilidade e tempo médio entre falhas (MTBF/MTTR).
- **🏢 Multi-Tenant:** Suporte a múltiplas empresas ou unidades fabris com isolamento de dados.

## 🛡️ Segurança e Boas Práticas

Durante a auditoria de código, o SmartMaint foi configurado com as seguintes diretrizes de segurança:
- **Prevenção contra SQL Injection:** Utilização estrita de *queries parametrizadas* com o pacote `mysql2`.
- **Criptografia de Senhas:** Hashes seguros gerados através da biblioteca `bcrypt`.
- **Autenticação:** Proteção de rotas baseada em roles com JSON Web Tokens (JWT).
- **Isolamento Multi-Tenant:** Filtro obrigatório de `tenant_id` em consultas operacionais para prevenir vazamento de dados entre empresas.
- **Dica de Produção:** Lembre-se de configurar a variável de ambiente `JWT_SECRET` com uma chave forte e avaliar a implementação de `express-rate-limit` nas rotas de login para prevenir força bruta.

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React.js** (Vite)
- **Lucide React** (Ícones)
- **React Router Dom** (Navegação)
- **Context API** (Gestão de Estado)

### Backend
- **Node.js** (Express)
- **MySQL** (Banco de Dados)
- **Dotenv** (Configuração de Ambiente)

## 🐳 Rodando com Docker (recomendado)

Sobe o projeto completo (MySQL + API + Frontend) com um único comando. Funciona no Linux, no macOS e no **Windows com Docker Desktop + WSL 2**.

### Pré-requisitos
- Docker com o plugin Compose (`docker compose version`)
- **Windows/WSL:** no Docker Desktop, ative *Settings → Resources → WSL Integration* para a sua distro e rode os comandos no terminal do WSL. Mantenha o projeto no sistema de arquivos do Linux (`~/...`), não em `/mnt/c/...`.

### Passo a passo
```bash
# 1. Crie o arquivo de variáveis e defina um JWT_SECRET forte
cp .env.example .env
#    gere uma chave com: openssl rand -hex 32

# 2. Construa as imagens e suba os containers
docker compose up -d --build

# 3. Acesse no navegador
#    http://localhost:8080
```

Na primeira inicialização o MySQL importa `server/database.sql` automaticamente (apenas a estrutura, sem usuários).
Crie o primeiro usuário master do backoffice:

```bash
docker compose exec -e MASTER_EMAIL=voce@empresa.com -e MASTER_PASSWORD='uma-senha-forte-123' api npm run create-master
```

> Em desenvolvimento, `server/seed-demo.sql` cria clientes e usuários de demonstração com senha conhecida. **Nunca use em produção.**

> Atualizando uma instalação existente? O usuário não-root do MySQL (`DB_USER`) só é criado em volumes novos. Em um volume antigo, crie-o manualmente ou mantenha `DB_USER=root` com a senha atual, e rode `ALTER TABLE users MODIFY role ENUM('Dono','Administrador','Usuário','Suporte') NOT NULL;`.

### Serviços
| Serviço | Container        | Porta no host                  | Descrição                                   |
|---------|------------------|--------------------------------|---------------------------------------------|
| `web`   | `smartmaint-web` | `8080` (`WEB_PORT`)            | Nginx com o build do React. Encaminha `/api` e `/uploads` para a API |
| `api`   | `smartmaint-api` | não exposta                    | Backend Node/Express (porta interna 3001)   |
| `db`    | `smartmaint-db`  | `127.0.0.1:3307` (`DB_EXTERNAL_PORT`) | MySQL 8, acessível só da própria máquina (DBeaver/Workbench) |

### Comandos úteis
```bash
docker compose ps                 # status dos containers
docker compose logs -f api        # logs do backend
docker compose up -d --build api  # rebuild só da API após alterar o código
docker compose down               # para tudo (mantém os dados)
docker compose down -v            # para tudo e APAGA banco e uploads
```

> Para reimportar o `database.sql` (por exemplo, depois de alterar o schema), rode `docker compose down -v` e suba de novo. Isso apaga os dados do banco.

## 📦 Como Instalar e Rodar (sem Docker)

### Pré-requisitos
- Node.js instalado
- MySQL instalado e rodando

### 1. Clonar o Repositório
```bash
git clone https://github.com/seu-usuario/smartmaint.git
cd smartmaint
```

### 2. Configurar o Backend
Acesse a pasta `server` e instale as dependências:
```bash
cd server
npm install
```

Crie um arquivo `.env` na pasta `server` com as seguintes variáveis:
```env
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=smartmaint_db
DB_PORT=3306
JWT_SECRET=gere-com-openssl-rand-hex-32
```

Importe o arquivo `database.sql` no seu banco de dados MySQL para criar a estrutura das tabelas.

### 3. Configurar o Frontend
Volte para a raiz e instale as dependências do frontend:
```bash
cd ..
npm install
```

### 4. Rodar a Aplicação
Inicie o **Backend** (em um terminal):
```bash
cd server
npm run dev
```

Inicie o **Frontend** (em outro terminal):
```bash
cd ..
npm run dev
```

A aplicação estará disponível em `http://localhost:5173`.

## 🤝 Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir uma Issue ou enviar um Pull Request.

1. Faça um Fork do projeto
2. Crie uma Branch para sua feature (`git checkout -b feature/NovaFeature`)
3. Commit suas mudanças (`git commit -m 'Adicionando nova feature'`)
4. Push para a Branch (`git push origin feature/NovaFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença ISC.

---
Desenvolvido por **Frederico** 🚀


## Pagamentos (Stripe)

1. Defina `STRIPE_SECRET_KEY` e `FRONTEND_URL` no `.env`. Em produção, sem a chave o checkout responde 503.
2. No painel do Stripe, cadastre um webhook apontando para `<FRONTEND_URL>/api/webhooks/stripe` com os eventos
   `checkout.session.completed`, `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed`.
3. Copie o segredo do endpoint (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.

Ao receber o pagamento, a fatura passa para **Paga** automaticamente (conferindo o valor) e, se o cliente não tiver
mais faturas em aberto, um tenant **Inadimplente** volta a **Ativo**. Para testar localmente: `stripe listen --forward-to localhost:3001/api/webhooks/stripe`.

## Segurança

- CORS limitado a `FRONTEND_URL`/`CORS_ORIGINS`; limite de 10 tentativas por 15 min em login e recuperação de senha.
- Novos clientes e usuários recebem senha provisória aleatória (retornada uma única vez como `temp_password`).
- O MySQL não é exposto fora de `127.0.0.1` e a API usa um usuário sem privilégios de root.

## Cadastro autoatendido e período de teste

- A tela `/signup` cria o cliente com status **Trial** (`TRIAL_DAYS`, padrão 14) e o primeiro administrador, já com login automático.
- O aceite dos Termos de Uso e da Política de Privacidade é obrigatório e fica registrado em `users.terms_accepted_at`.
- Com o trial vencido o login é bloqueado (`TRIAL_EXPIRED`). Para liberar, mude o contrato do cliente no Backoffice (status **Ativo**).
  Sessões já abertas continuam válidas até o token expirar (24 h).
- Limite de 5 cadastros por hora por IP. `SIGNUP_ENABLED=false` desliga o cadastro.
- Banco já existente? Aplique `server/migrations/001_trial_signup.sql`.
- **Ainda não implementado:** confirmação do e-mail no cadastro e cobrança automática ao fim do trial.

## Testes

```bash
cd server
npm run test:docker   # sobe um MySQL descartável em Docker, roda a suíte e remove o container
npm test              # usa TEST_DB_HOST/PORT/USER/PASSWORD (um MySQL já em execução)
```

## Planos e limites

O catálogo fica em `server/utils/plans.js` (mantenha em sincronia com a tabela de preços publicada).

| Plano | Ativos | Usuários | FMEA | Simulador R(t) | Importação por planilha |
|---|---|---|---|---|---|
| Essencial | 50 | 3 | – | – | – |
| Profissional | 300 | 10 | ✅ | ✅ | ✅ |
| Industrial | 1.000 | 30 | ✅ | ✅ | ✅ |
| Corporativo | ilimitado | ilimitado | ✅ | ✅ | ✅ |

- **Excedentes:** `extra_assets` e `extra_users` (Backoffice → contrato do cliente) somam-se ao limite do plano.
- **Servidor aplica:** limite de ativos e de usuários (com trava por cliente, então requisições simultâneas não estouram o limite) e o bloqueio da API de FMEA (`403 FEATURE_NOT_IN_PLAN`).
- **Só na interface:** o Simulador R(t) é calculado no navegador a partir das falhas cadastradas; o servidor não o bloqueia, a tela apenas oferece o upgrade.
- **Downgrade não apaga dados:** o cliente acima do novo limite mantém o que já tem; só o cadastro de novos itens é bloqueado.
- Cadastro autoatendido e trial começam no plano **Profissional**.
- `GET /api/plan` devolve plano, limites, uso e recursos do cliente.
- **Não modelado:** "plantas" (multi-unidade). Hoje cada cliente é um único tenant; não prometa limite de plantas até isso existir.
- Banco já existente? Aplique `server/migrations/002_plan_limits.sql` (renomeia Starter/Pro/Enterprise e cria os campos de excedente). Revise antes: planos desconhecidos viram Essencial.

## Importação de ativos por planilha

Disponível a partir do plano **Profissional**. Em *Equipamentos → Importar planilha*:

1. Baixe o modelo (ou use o seu): **.xlsx** ou **.csv**, até 1.000 linhas e 5 MB. A primeira linha traz os títulos; só **Nome** é obrigatório.
   Colunas reconhecidas (com ou sem acento/maiúsculas): Nome, Tipo, Modelo, Número de série, Horas operadas, Data de início. Outras colunas são ignoradas.
2. O sistema mostra uma **pré-visualização** (quantos serão importados, quais linhas são duplicadas) sem gravar nada.
3. Ao confirmar, a importação é **tudo ou nada**: qualquer linha inválida ou estouro do limite do plano recusa o lote inteiro, com a linha de cada erro.

Regras do servidor (`POST /api/equipments/import`, `server/routes/importRoutes.js`):
- Só gestão do cliente (Dono, Administrador, Gerente) ou backoffice importa; usuário comum não.
- Equipamento com número de série já cadastrado (ou repetido na planilha, sem diferenciar maiúsculas/acentos) é **ignorado** e informado: reenviar a mesma planilha não duplica. Linhas sem série nunca são consideradas duplicadas.
- Respeita o limite de ativos do plano (incluindo excedentes) com a mesma trava por cliente do cadastro individual; os ignorados não consomem vaga.
- A leitura do arquivo acontece no navegador (CSV com `;`/`,`/tab, UTF-8 ou Windows-1252, datas `dd/mm/aaaa`, milhares `1.200`; XLSX via `read-excel-file`, carregado só quando usado).
- Formulas, imagens e abas extras do Excel não são interpretadas: só a primeira aba, só valores.

Testes: `npm run test:unit` (leitura de CSV/XLSX, incluindo um `.xlsx` real em `src/utils/__fixtures__`) e a suíte do servidor (`cd server && npm run test:docker`).

## QR code por equipamento e aplicativo instalável (PWA)

**QR code.** Em *Equipamentos*, o ícone de QR de cada linha mostra o código do equipamento e imprime a etiqueta; o botão
*Etiquetas QR* imprime uma folha com todos os equipamentos filtrados (até 120 por folha). O QR abre `/ativo/:id`, a ficha do
equipamento (dados, últimas O.S., preventivas) com o botão **Abrir O.S. para este equipamento**, pensada para celular.
- É preciso estar logado: quem escaneia sem sessão é levado ao login e volta para a ficha depois.
- A ficha só mostra equipamentos do próprio cliente; id de outra empresa responde 404 (igual a id inexistente).
- **Defina `VITE_PUBLIC_APP_URL`** no build (ex.: `https://app.suaempresa.com.br`). Ela vai dentro do QR: se um dia o endereço
  interno mudar, as etiquetas já coladas nas máquinas continuam valendo. Sem ela, usa o endereço em que o sistema estiver aberto.
- A leitura é feita pela câmera do celular (não há leitor dentro do app).

**Aplicativo instalável (PWA).** O sistema pode ser instalado no celular/computador ("Instalar aplicativo" no menu ou pelo navegador).
- Gera `manifest.webmanifest` e `sw.js` no build (`vite-plugin-pwa`). Exige **HTTPS** em produção (em `localhost` funciona sem).
- **Offline:** o aplicativo abre sem internet, mas os **dados vêm do servidor**: sem conexão aparece um aviso e **nada é salvo**.
  A API e os uploads nunca são guardados em cache. Não há fila de gravação offline.
- O servidor e o nginx entregam `sw.js`/manifesto com `Cache-Control: no-cache` para que versões novas cheguem aos aparelhos.
- O menu lateral começa recolhido em telas estreitas. As demais telas do sistema ainda não foram redesenhadas para celular;
  a ficha do QR (`/ativo/:id`) é a tela pensada para uso em campo.
- Ícones em `public/icons` (gerados a partir de `src/assets/logo.png`).

## Assinatura recorrente (Stripe)

Clientes contratam (e o acesso é liberado ou bloqueado) automaticamente, sem intervenção do suporte.

**Como funciona**
1. O administrador do cliente escolhe plano e ciclo (mensal ou anual) em *Configurações → Empresa* e vai ao checkout do Stripe (cartão).
   Os valores saem **sempre do servidor** (`server/utils/plans.js`, campo `price`): o valor enviado pelo navegador é ignorado.
   Quem assina durante o teste não perde os dias que restam (a primeira cobrança só ocorre ao fim dele).
2. O Stripe avisa o sistema pelo webhook (`/api/webhooks/stripe`, assinatura verificada). **O Stripe é a fonte da verdade:**

   | Status no Stripe | Acesso do cliente |
   |---|---|
   | `active`, `trialing` | liberado (plano, ciclo, próximo vencimento e valor ficam no contrato) |
   | `past_due` | **mantido** durante as novas tentativas de cobrança; a tela avisa o administrador |
   | `unpaid`, `paused` | bloqueado (`Inadimplente`) |
   | `canceled` | bloqueado (`Cancelado`) |
   | `incomplete` | nada muda (continua em teste) |

3. Quem está com teste vencido ou pagamento pendente consegue entrar **só no faturamento** (token restrito de 30 min, emitido apenas a
   administradores depois de validar a senha) para assinar ou regularizar. Esse token é recusado em todo o resto do sistema.
4. *Gerenciar assinatura e faturas* abre o **portal do Stripe** (trocar cartão, ver faturas, cancelar).
5. Cada cobrança paga é espelhada na tabela de faturas (histórico/MRR no backoffice).

**Configuração**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `FRONTEND_URL` (veja `.env.example`; o webhook precisa dos 8 eventos listados lá).
- No painel do Stripe, **ative o portal do cliente** (Billing → Customer portal) e deixe desligada a troca de plano por ele: planos mudam por um novo checkout ou pelo suporte.
- Os preços são criados no Stripe na hora do checkout (`price_data`), sem cadastro prévio de produtos.
- **Cupons** (ex.: a oferta de lançamento): crie no painel do Stripe; o checkout já aceita código promocional.
- Banco já existente? Aplique `server/migrations/003_subscriptions.sql`.

**Garantias (cobertas por testes)**
- Eventos repetidos são aplicados uma vez; eventos fora de ordem são ignorados; evento de assinatura antiga não cancela quem já contratou outra.
- Um tenant nunca adota o cliente do Stripe de outro; plano inválido na metadata não altera o plano.

**Limitações conhecidas**
- Só **cartão**: não usei boleto/Pix porque a recorrência com eles depende do provedor e da conta. Se boleto/Pix recorrentes forem essenciais, o caminho é um provedor local (ex.: Asaas).
- **Excedentes** (usuário/ativos extras) continuam sendo ajustados no Backoffice e **não são cobrados automaticamente** na assinatura.
- Cliente com assinatura **cancelada** não se reativa sozinho (precisa falar com o suporte).
- **O que foi e o que não foi validado contra o Stripe de verdade.** Os testes automatizados usam um Stripe simulado e eventos assinados com o mesmo algoritmo do Stripe. Além disso, a criação da sessão de checkout de assinatura foi aceita **uma vez pela API real do Stripe em modo de teste** (chave restrita `rk_test_`). **Não** foram validados com o Stripe real: o portal do cliente, o pagamento completo com cartão de teste, e a entrega dos webhooks reais. **Faça um teste ponta a ponta no modo de teste do Stripe antes de cobrar clientes** (cartão `4242 4242 4242 4242`, com o webhook apontando para o seu servidor).
