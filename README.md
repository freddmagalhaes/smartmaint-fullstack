# 🛠️ SmartMaint - Gestão Inteligente de Manutenção

SmartMaint é uma plataforma moderna e intuitiva para o gerenciamento de ativos, manutenção industrial e análise de risco. Projetada para otimizar processos de manutenção preventiva, corretiva e preditiva, a aplicação oferece uma visão consolidada de indicadores de performance (KPIs) e suporte à metodologia FMEA.

## 🚀 Funcionalidades Principais

- **📊 Dashboard Estratégico:** Visualização de indicadores em tempo real.
- **📋 Ordens de Serviço:** Gestão completa do ciclo de vida das O.S.
- **⚙️ Gestão de Ativos:** Cadastro e monitoramento de equipamentos por unidade (Tenant).
- **⚠️ Registro de Falhas:** Histórico detalhado de quebras e reparos.
- **🔍 Análise FMEA:** Identificação de modos de falha, efeitos e criticidade.
- **📈 Simulador R(t):** Cálculo de confiabilidade e tempo médio entre falhas (MTBF/MTTR).
- **🏢 Multi-Tenant:** Suporte a múltiplas empresas ou unidades fabris com isolamento de dados.

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

## 📦 Como Instalar e Rodar

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
