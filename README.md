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

Na primeira inicialização o MySQL importa `server/database.sql` automaticamente, com a estrutura e os usuários iniciais.

### Serviços
| Serviço | Container        | Porta no host                  | Descrição                                   |
|---------|------------------|--------------------------------|---------------------------------------------|
| `web`   | `smartmaint-web` | `8080` (`WEB_PORT`)            | Nginx com o build do React. Encaminha `/api` e `/uploads` para a API |
| `api`   | `smartmaint-api` | não exposta                    | Backend Node/Express (porta interna 3001)   |
| `db`    | `smartmaint-db`  | `3307` (`DB_EXTERNAL_PORT`)    | MySQL 8, acessível por clientes como DBeaver/Workbench |

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
