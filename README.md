# Chat Público em Tempo Real para Rádio Web - Integração Hermes AI & Supabase

Este é um sistema completo e funcional de Chat em Tempo Real inspirado em plataformas como o Minnit, desenvolvido especialmente para integração com uma rádio web e automação via o assistente **Hermes** hospedado em sua VPS Linux.

---

## 📁 Estrutura de Pastas do Projeto

O projeto é organizado seguindo o padrão full-stack (Express + React + Vite + Socket.IO) de alta performance:

```text
/
├── server.ts              # Servidor backend Node.js (Express + Socket.IO + Integração Hermes & Supabase)
├── package.json           # Dependências de produção e scripts de compilação
├── vite.config.ts         # Configuração de bundler do ecossistema React/Vite
├── index.html             # Arquivo HTML principal do entry point
├── .env.example           # Modelo de variáveis de ambiente para preenchimento
│
└── src/
    ├── main.tsx           # Entry point inicial da aplicação cliente
    ├── App.tsx            # Tela única SPA do player de rádio e chat em tempo real
    ├── index.css          # Importações globais do Tailwind CSS v4
    ├── types.ts           # Definição e interfaces tipadas (ChatMessage, UserSession)
    └── lib/
        └── supabase.ts    # Inicializador flexível do cliente Supabase (fail-safe)
```

---

## ⚙️ Variáveis de Ambiente Necessárias (.env)

Para que o chatbot se conecte perfeitamente com sua VPS e o banco de dados do Supabase, você precisará configurar as seguintes correspondências no seu arquivo de segredos ou `.env` da aplicação:

1. **`HERMES_API_URL`**: O endereço IP e a porta de comunicação do bot Hermes na sua VPS (ex: `http://192.168.1.100:9900` ou outro IP público que abriga sua API).
2. **`SUPABASE_URL`**: O endpoint da sua instância do Supabase.
3. **`SUPABASE_ANON_KEY`**: A chave anônima pública gerada no console da API do Supabase.

---

## 🗄️ Estrutura da Tabela do Supabase

Execute a seguinte instrução SQL no painel de administração (SQL Editor) do seu Supabase para instanciar a tabela de mensagens necessária imediatamente:

```sql
-- Criar a tabela de mensagens
create table mensagens (
  id bigint generated always as identity primary key,
  usuario text not null,
  mensagem text not null,
  datahora timestamptz default now() not null,
  tipo text not null default 'usuario' -- opções válidas: 'usuario', 'hermes', 'sistema'
);

-- Opcional: Adicionar índices de ordenação para as últimas mensagens acelerando as consultas do bate-papo
create index idx_mensagens_datahora on mensagens (datahora desc);
```

---

## 🤖 Fluxo de Integração com o Agente Hermes

O sistema se conecta aos endpoints do seu agente Hermes hospedado na VPS através do seguinte fluxo automatizado em tempo real:

### 1. Chamada de Entrada (POST /mensagem)
Quando um usuário envia uma mensagem começando com `@hermes` ou contendo `Hermes`, o servidor envia um payload POST instantâneo para:

- **Endereço**: `POST http://156.67.31.108:9900/mensagem`
- **Body**:
  ```json
  {
    "message": "texto enviado pelo usuário"
  }
  ```
- **Resposta Esperada**:
  ```json
  {
    "id": "0dfdcd1f",
    "status": "processando"
  }
  ```

### 2. Polling de Resposta (GET /resposta/{id})
Ao receber o ID do processamento, o servidor imediatamente:
- Envia aos ouvintes uma notificação temporária: *"Hermes está preparando uma resposta..."*.
- Inicia um **polling automático a cada 3 segundos** requisitando:
  - **Endereço**: `GET http://156.67.31.108:9900/resposta/0dfdcd1f`

#### Estados verificados durante o Polling:
- **Ainda processando**:
  ```json
  {
    "status": "processando",
    "resposta": null
  }
  ```
- **Concluído (Pronto)**:
  ```json
  {
    "status": "pronto",
    "resposta": "texto gerado pelo Hermes"
  }
  ```

Ao identificar o status como `"pronto"`, o polling é encerrado com sucesso e a mensagem final do bot `🤖 Hermes` é transmitida em tempo real via WebSockets para todos os usuários conectados simultaneamente!

---

## 🛡️ Comandos de Moderação Pública

O sistema possui comandos embarcados que podem ser digitados pelo moderador ou ativados pelos respectivos botões interativos na aba de moderação:

- `/silenciar <nome-ouvinte>`: Adiciona o usuário na blacklist de silêncio temporário do servidor do chat.
- `/banir <nome-ouvinte>`: Expulsa o ouvinte, desconectando o seu respectivo socket, e proíbe novas conexões com este nickname na VPS.
- `/apagar <id-da-mensagem>`: Deleta fisicamente uma mensagem específica da lista global e também a desconecta do banco do Supabase, avisando todos os sockets ativos.

---

## 🚀 Passo a Passo de Implantação Completa em sua VPS Linux

Siga o roteiro abaixo para instanciar este chat na sua própria VPS de produção de forma resiliente:

### Passo 1: Instale o Node.js na sua VPS
Atualize seu terminal e instale a versão LTS estável do Node.js:
```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Passo 2: Clonar/Subir o código para a VPS
Envie os arquivos deste projeto para uma pasta na sua VPS (por exemplo, `/var/www/radio-chat`).

### Passo 3: Instalar as dependências do projeto na VPS
Navegue até a pasta do projeto e instale todos os módulos necessários:
```bash
cd /var/www/radio-chat
npm install
```

### Passo 4: Configurar arquivo de variáveis de ambiente
Crie o arquivo `.env` na VPS com os seus dados reais:
```bash
nano .env
```
Preencha o conteúdo:
```env
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_ANON_KEY="sua-chave-anonima-publica"
HERMES_API_URL="http://IP_DA_VPS:9900"
NODE_ENV="production"
```

### Passo 5: Compilar e Iniciar a Aplicação
Execute o build do ecossistema e inicialize o servidor de produção:
```bash
npm run build
```

### Passo 6: Executar com PM2 para garantir que o chat nunca caia
Para gerenciar o processo do chat em segundo plano e garantir reinicialização automática em caso de falhas da VPS, instale e utilize o **PM2**:
```bash
sudo npm install -y -g pm2
pm2 start npm --name "radio-web-chat" -- start
pm2 save
pm2 startup
```

Pronto! Seu servidor web chat de Rádio estará executando perfeitamente em sua porta `3000` rodando perfeitamente integrado com o Hermes AI e Supabase!
