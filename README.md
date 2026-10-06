# Agenda de Implantação — Net Turbo Telecom

Sistema web de gestão das atividades de campo da área de Implantação e Infraestrutura: agendamento das fases de construção de circuitos, execução pelos técnicos no celular, relatórios fotográficos, LPU (lista de preços unitários) com assinatura digital, aprovação financeira, controle de estoque dos técnicos e indicadores de desempenho.

- **Responsável funcional:** Gabriel Milhomens, Coordenador de Implantação e Infraestrutura
- **Endereço atual (piloto):** `https://gabrielmilhomens.github.io/Estoque-de-t-cnicos-bols-o-elleven-/agenda.html`
- **Backend:** Supabase, projeto `ksatofcjlqziqhblpwul`

---

## 1. Visão geral da arquitetura

```
 Navegador / PWA (celular e computador)
   agenda.html  ── relatorio-ativacao.html
   sw.js (notificações)  manifest.webmanifest
        │  HTTPS (supabase-js, chave pública "anon" + sessão do usuário)
        ▼
 Supabase
   ├─ Auth ............ login por e-mail e senha (mesmo login do antigo Estoque de Materiais)
   ├─ Postgres ........ tabelas ag_*, estoque, permissões, com Row Level Security (RLS)
   ├─ Storage ......... bucket privado "agenda" (anexos, PDFs de LPU, relatórios, fotos)
   ├─ Realtime ........ atualização ao vivo das telas
   ├─ Edge Function ... "agenda-lembretes" (Deno): notificações push
   ├─ pg_cron ......... dispara a função a cada 10 minutos
   └─ pg_net + triggers  avisos imediatos (atividade nova, remarcada, pedido de prazo...)
        │
        ▼
 Web Push (VAPID) → navegadores dos usuários
```

- **Front-end sem build:** cada tela é um único arquivo HTML com CSS e JavaScript embutidos. Não há etapa de compilação, Node ou framework; basta servir os arquivos estáticos.
- **Regras de acesso no banco:** toda a segurança de dados está no Postgres (RLS e funções `security definer`). O front-end usa só a chave pública (`anon`); a chave de serviço (`service_role`) existe apenas dentro da Edge Function.
- **Gravação:** o front-end mantém o estado em memória e sincroniza com o banco por diferença (insert, update e delete só do que mudou), com fila local para quedas de conexão.

---

## 2. Arquivos do repositório

| Arquivo | Função |
|---|---|
| `agenda.html` | Aplicação principal (todas as telas da gestão e dos técnicos). Aproximadamente 350 KB. |
| `relatorio-ativacao.html` | Relatório de Entrega de Circuito (ativação). Abre na mesma janela a partir da agenda, com o mesmo visual das telas do técnico (barra "Voltar para a atividade", cartão do cliente, seções numa única página e progresso de itens preenchidos). Gera o PDF no modelo original, envia ao Storage e retorna para a atividade. Nenhum item é obrigatório. |
| `sw.js` | Service worker: recebe e exibe as notificações push e abre a atividade ao tocar. Não faz cache de páginas. |
| `manifest.webmanifest` | Manifesto PWA (nome, ícones, cores, `id` do app). Permite instalar no celular e no computador. |
| `icon-192.png`, `icon-512.png` | Ícones do app (símbolo da Net Turbo). |
| `index.html` | Redirecionamento do endereço antigo do Estoque de Materiais para `agenda.html` (aplicar só depois de desligar o sistema antigo). |
| `README.md` | Este documento. |

**Não versionar no repositório público:**

| Arquivo | Onde vai |
|---|---|
| `agenda_implantacao_supabase.sql` e `agenda_ajuste_01` a `09` | SQL Editor do Supabase (migrações). Os ajustes 02 e 03 contêm o segredo da rotina (`CRON_SECRET`) embutido. |
| `agenda-lembretes.ts` | Código da Edge Function (pode ficar em repositório privado). |
| `NAO_SUBIR_NO_GITHUB_segredos_notificacoes.txt` | Segredos da Edge Function (ver seção 6). |

---

## 3. Bibliotecas externas (carregadas por CDN)

| Biblioteca | Versão | Uso |
|---|---|---|
| `@supabase/supabase-js` | 2 (jsDelivr) | Autenticação, banco, Storage, Realtime e chamada da Edge Function |
| jsPDF | 2.5.1 | Geração de PDFs (LPU, relatórios fotográficos, relatório de não conclusão) |
| jsPDF-AutoTable | 3.5.31 | Tabelas nos PDFs |
| PDF.js | 3.11.174 | Leitura do PDF do ROI no cadastro de projetos |
| PapaParse | 5.4.1 | Leitura dos CSVs do Elleven (estoque) |
| SheetJS (xlsx) | 0.18.5 | Leitura da planilha do bolsão SAP (estoque) |
| signature_pad | 4.0.0 | Assinatura do cliente no relatório de ativação |
| html2canvas | 1.4.1 | Captura de tela no relatório de ativação |
| Google Fonts (Barlow, Barlow Condensed) | — | Tipografia |

Para um ambiente interno sem acesso à internet pública, essas bibliotecas precisam ser hospedadas localmente e os `<script src>` ajustados.

---

## 4. Banco de dados

### 4.1 Tabelas da agenda (prefixo `ag_`)

| Tabela | Conteúdo |
|---|---|
| `ag_projetos` | Base de previsão: um projeto por etiqueta (cliente, protocolo, valor mensal, topologia, metragem, dias previstos por fase, dados extraídos do ROI). Dados variáveis em `dados jsonb`. |
| `ag_complementos` | Endereço, contato, telefone, janela de atendimento, acesso e observações do projeto. |
| `ag_agendamentos` | Atividades: etiqueta, técnico, data, status, fases e `dados jsonb` (tempos, materiais, fotos exigidas, relatórios, medições, dias de execução, diário por dia, pedido de prazo, motivo de não conclusão). |
| `ag_lpus` | LPUs enviadas pelos técnicos: itens, total, conta contábil, status, histórico de aprovação, caminho do PDF assinado. |
| `ag_anexos`, `ag_anexos_log` | Anexos dos projetos (KMZ e outros) e log das exclusões automáticas. |
| `ag_budget` | Budget mensal de mão de obra terceirizada por conta contábil. |
| `ag_push`, `ag_notificacoes` | Aparelhos registrados para notificação e controle de avisos já enviados (evita repetição). |
| `agenda_papeis` | Papel de cada usuário na agenda (`coordenador`, `supervisor`, `encarregado`, `tecnico`, `supply`), vínculo (`clt` ou `terceiro`) e permissões personalizadas (`permissoes jsonb`). |

### 4.2 Tabelas do antigo sistema de Estoque (reaproveitadas)

`perfis` (cadastro e login), `estoque` (saldo por técnico e material: bolsão SAP e Elleven), `movimentacoes` (histórico do bolsão e do saldo base), `movimentacoes_elleven` (extrato de entradas e saídas), `saldo_base_elleven` (data-base de cada técnico), `metadados_estoque` (data da última atualização). A agenda passou a absorver todas as funções desse sistema.

### 4.3 Funções principais

| Função | Papel |
|---|---|
| `ag_papel()`, `ag_gestao()`, `ag_coord()`, `ag_supply()` | Identificam o papel do usuário logado. |
| `ag_pode(chave)` | Verifica uma permissão da matriz de permissões (telas e ações). O coordenador sempre pode tudo; `permissoes` nulo usa o padrão do papel. |
| `ag_aprova_lpu()`, `ag_reagenda()` | Atalhos de permissão usados nas políticas. |
| `ag_projetos_tecnico()` | Devolve os projetos ao técnico sem o valor mensal do cliente. |
| `ag_painel_dia(data)` | Atividades do dia para o Painel do dia (gestão e perfil Visualização), sem dados financeiros nem de contato. |
| `ag_meu_doc()` | CPF/CNPJ normalizado do usuário (para o técnico ver o próprio estoque). |
| `ag_registrar_push()` | Registra o aparelho para notificações. |
| `ag_chamar_avisos()`, `ag_aviso_insert()`, `ag_aviso_update()` | Triggers que chamam a Edge Function na hora (atividade nova, remarcada, transferida, cancelada, pedido de prazo e resposta). |
| `ag_touch()`, `ag_agendamento_guard()`, `ag_tecnico_no_projeto()` | Carimbo de atualização e proteções de gravação. |

### 4.4 Storage (bucket privado `agenda`)

```
anexos/<etiqueta>/...                     KMZ e anexos dos projetos
lpus/<id do técnico>/...                  PDFs das LPUs assinadas
relatorios/<id da atividade>/...          PDF do relatório de entrega (ativação)
relatorios/<id da atividade>/fotografico/ PDFs dos relatórios fotográficos e de não conclusão
relatorios/<id da atividade>/dias/        fotos do resumo de cada dia (atividades de vários dias)
```

Os arquivos são abertos por URL assinada temporária. As fotos são reduzidas no próprio celular (cerca de 1600 px, JPEG 70%) antes do envio. Limite por arquivo: 50 MB.

### 4.5 Ordem de execução dos scripts SQL (ambiente novo)

1. `agenda_implantacao_supabase.sql` — tabelas, funções, RLS e bucket
2. `agenda_ajuste_01_ocultar_valores.sql` — valor mensal oculto para técnicos
3. `agenda_ajuste_02_notificacoes.sql` — tabelas de push, `pg_net` e agendamento no `pg_cron`
4. `agenda_ajuste_03_aviso_nova_atividade.sql` — triggers de aviso imediato
5. `agenda_ajuste_04_relatorios.sql` — permissões de envio de relatórios e limite de 50 MB
6. `agenda_ajuste_05_budget.sql` — tabela de budget
7. `agenda_ajuste_06_lpu_todos_tecnicos.sql` — LPU para técnicos CLT e terceiros
8. `agenda_ajuste_07_estoque_na_agenda.sql` — estoque dentro da agenda e papel Supply Chain
9. `agenda_ajuste_08_permissoes.sql` — permissões por usuário (`ag_pode`)
10. `agenda_ajuste_09_varios_dias_e_prazo.sql` — avisos de pedido de prazo e atividades de vários dias
11. `agenda_ajuste_10_painel_do_dia.sql` — papel Visualização, função `ag_painel_dia` e Painel do dia no padrão de supervisor e encarregado

Os scripts são idempotentes (`if not exists`, `drop policy if exists`, `create or replace`) e podem ser executados de novo sem perda de dados.

---

## 5. Perfis de acesso

| Perfil | Acesso padrão |
|---|---|
| Coordenador | Tudo, incluindo usuários, permissões, budget, saldo base do Elleven e Visão do técnico. |
| Supervisor | Painel de KPIs (com aprovação de LPU), Agenda, Relatórios, Estoque (com importações) e Projetos. Não reagenda nem define budget. |
| Encarregado | Agenda (agendar, reagendar, cancelar, anexos), Relatórios, Estoque (consulta e movimentações) e Projetos. |
| Supply Chain | Somente publicação da planilha diária do bolsão (SAP). |
| Visualização | Somente o Painel do dia (outros setores, TV da sala). Não acessa as tabelas da agenda: lê os dados pela função `ag_painel_dia`, sem valores, endereços ou telefones. |
| Técnico CLT | Minhas atividades, Meu estoque e Meu histórico. |
| Técnico terceiro | Igual ao CLT, mais Gestão financeira (LPUs e totais). |

A coordenação pode personalizar, por usuário, as telas e ações da gestão em **Usuários e acessos → Permissões**. Usuários novos de gestão começam sem nenhuma tela. As ações sensíveis (aprovar LPU, definir budget, importar estoque, saldo base) também são validadas no banco por `ag_pode()`.

O login é por e-mail e senha no Supabase Auth; novos cadastros ficam pendentes até a coordenação aprovar e atribuir um papel.

---

## 6. Notificações push (Edge Function `agenda-lembretes`)

**Implantação:** Supabase → Edge Functions → `agenda-lembretes` → colar o conteúdo de `agenda-lembretes.ts` → Deploy. A verificação de JWT ("Enforce JWT Verification") fica **desligada**; a função valida o usuário (teste) ou o segredo da rotina (`x-cron-secret`).

**Segredos (Edge Functions → Secrets):**

| Nome | Conteúdo |
|---|---|
| `VAPID_PUBLIC_KEY` | Chave pública VAPID (a mesma embutida no `agenda.html`) |
| `VAPID_PRIVATE_KEY` | Chave privada VAPID |
| `VAPID_EMAIL` | E-mail de contato do remetente das notificações |
| `CRON_SECRET` | Segredo enviado pelo `pg_cron` e pelos triggers no cabeçalho `x-cron-secret` |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos automaticamente pelo Supabase.

**Rotina (a cada 10 minutos, das 7h às 20h, horário de São Paulo):**

| Regra | Para quem | Quando |
|---|---|---|
| Atividade não iniciada | Técnico | Atividade do dia ainda agendada após 9h, ou atrasada |
| Previsão de chegada vencida | Técnico | 30 minutos após a previsão informada |
| Execução longa | Técnico | Em execução há mais de 4 horas |
| Você termina hoje? | Técnico | Em execução no último dia agendado, há mais de 5 horas ou após 15h30 |
| Atividade em aberto | Técnico | Atividade não encerrada após 18h |
| Técnico sem resposta | Encarregados | 60 minutos após um aviso sem reação |

**Avisos imediatos (via trigger):** atividade nova, remarcada, transferida e cancelada (técnico); pedido de prazo (coordenador e encarregados); resposta ao pedido (técnico).

Cada aviso é enviado uma única vez por atividade e por dia (`ag_notificacoes`). No iPhone, as notificações exigem que o app seja adicionado à Tela de Início.

---

## 7. Módulos funcionais

- **Base de previsão:** cadastro de projetos em 3 etapas (leitura automática do PDF do ROI, endereço e dados técnicos), status por fase e regras por topologia (Firewall e Last mile sem lançamento liberam a ativação direto).
- **Agenda:** calendário (dia, semana e mês), agendamento por fase, materiais da atividade (editáveis), observações para o técnico, fotos exigidas no relatório, atividades de vários dias ou uma por dia, reagendamento, replicação, anexos com exclusão automática ao fim da fase, pedidos de prazo dos técnicos.
- **Técnico (celular):** fluxo deslocamento → chegada → execução → relatório → LPU → encerrada; bloqueio de uma atividade enquanto outra está em andamento; encerramento por dia; pedido de mais dias; registro de não conclusão com relatório do que foi feito.
- **Relatórios:** fotográfico de lançamento e extensão (câmera ou galeria, lote, metragem, nível de sinal em dBm), relatório de entrega de circuito (ativação) e relatório de não conclusão. Todos geram PDF guardado na atividade. A tela **Operação → Relatórios** organiza tudo por cliente.
- **LPU:** preenchimento pelos técnicos em tela própria e em 3 passos (serviços, conferência e assinatura), sem exibição de valores. Busca por código ou descrição que ignora acentos e aceita palavras em qualquer ordem, filtro por classe, inclusão item a item com quantidade e condição (comum ou crítica), aviso da metragem registrada no relatório, observação para a gestão e declaração de execução antes de assinar. Gera o PDF assinado. Aprovação com conferência de cabo (relatório × LPU × ROI) e alertas de divergência.
- **Financeiro:** budget mensal por conta contábil (consumido pelas LPUs aprovadas no mês da aprovação), comparação ROI × LPU e detalhamento por classe e por item.
- **Estoque:** visão por técnico (bolsão SAP + Elleven, comprometido pelos agendamentos), importação da planilha do bolsão e do extrato do Elleven, saldo base, movimentações, e Meu estoque e Meu histórico para os técnicos.
- **Painel do dia (grupo Operação):** visão somente leitura das atividades de hoje, para outros setores e para TV: números do dia, filtro por cidade e colunas Aguardando início, A caminho, Em execução e Encerradas, com as últimas atualizações enviadas pelo técnico e o selo de circuito entregue. Atividades de vários dias aparecem em cada dia com "dia X de Y"; quando o técnico encerra o dia, o card vai para Encerradas com "Continua amanhã" (ou "Aguardando prazo") e o resumo do dia. Atualiza sozinho a cada minuto.
- **Atualizações do andamento:** durante a execução, o técnico envia quantas atualizações quiser (situação, metragem, comentário e foto), exibidas no Painel do dia e no card da atividade.
- **Painel de KPIs:** visão geral, entregas, rede executada (cabo, cordoalha, reaberturas de CEO, extensão de fibra), execução em campo, equipes e financeiro.

---

## 8. Publicação

**Atual (piloto):** GitHub Pages, servindo os arquivos estáticos da raiz do repositório. Uma alteração publicada chega aos usuários em alguns minutos, sem reinstalar o app.

**Para hospedagem interna:**

1. Servir `agenda.html`, `relatorio-ativacao.html`, `sw.js`, `manifest.webmanifest` e os ícones em um servidor web com **HTTPS** (obrigatório para service worker, notificações push, câmera e instalação como app).
2. Manter os arquivos na mesma pasta: o manifesto usa `scope: "./"` e `start_url: "agenda.html"`, e o service worker é registrado pelo caminho relativo.
3. Ajustar no `agenda.html` e no `relatorio-ativacao.html` a URL e a chave pública do Supabase, se o projeto mudar.
4. Não é preciso mexer na Edge Function: o link aberto ao tocar na notificação (`APP_URL = "agenda.html"`) é relativo e funciona em qualquer domínio.
5. Em Supabase → Authentication → URL Configuration, cadastrar o novo domínio (necessário para a redefinição de senha por e-mail).
6. Se o Supabase também for internalizado (auto-hospedado), confirmar a disponibilidade das extensões `pg_cron` e `pg_net`, do Storage, do Realtime e das Edge Functions, e executar os scripts na ordem da seção 4.5.

---

## 9. Pontos de atenção

- **Cota do plano gratuito do Supabase:** o limite de armazenamento é de 1 GB por organização. As fotos já são reduzidas no envio, mas o volume de relatórios cresce com o uso; recomenda-se plano pago ou uma política de retenção para a produção interna.
- **Segredos nos scripts:** os ajustes 02 e 03 gravam o `CRON_SECRET` dentro de funções do banco. Em produção, a recomendação é migrar esse valor para o Supabase Vault.
- **Chave pública no front-end:** a chave `anon` é pública por natureza; a proteção dos dados depende das políticas RLS, que precisam ser preservadas em qualquer migração.
- **LPU em nome de outro usuário:** por regra de segurança, o banco só aceita LPU enviada pelo próprio técnico. Testes feitos pela "Visão do técnico" da coordenação não geram LPU.
- **Dependência de CDNs:** ver seção 3.

---

## 10. Teste rápido após publicar

1. Entrar como coordenador e conferir o menu (Acompanhamento, Operação, Estoque, Projetos, Campo, Administração).
2. Cadastrar um projeto de teste, agendar uma fase para um técnico de teste e confirmar a notificação de "Nova atividade".
3. No celular do técnico: iniciar deslocamento, chegar, iniciar, concluir, enviar o relatório fotográfico e a LPU.
4. Na gestão: abrir **Financeiro → Aprovação de LPU**, conferir os relatórios e aprovar.
5. Em **Estoque → Atualizar estoque**, publicar uma planilha do bolsão e conferir em **Movimentações**.
6. Em Supabase → Edge Functions → `agenda-lembretes` → **Logs**, confirmar as execuções a cada 10 minutos.

---

## 11. Histórico de alterações

Registro das mudanças no código. A cada alteração, este README é atualizado e a entrada correspondente é incluída no topo desta lista.

| Data | Alteração | Arquivos e passos |
|---|---|---|
| 06/10/2026 | Relatório de Entrega de Circuito no layout da agenda: seções numa única página, redundância e tipo de link em botões, campos de IP estático ou PPPoE conforme o tipo, progresso de itens preenchidos e envio no fim da página. O PDF segue o mesmo modelo; sem link redundante, o bloco passa a se chamar "Link". | `relatorio-ativacao.html` |
| 06/10/2026 | Painel do dia no grupo Operação (somente leitura, para outros setores e TV), perfil Visualização e atualizações do andamento enviadas pelo técnico durante a execução. | `agenda.html`, `agenda_ajuste_10` |
| 06/10/2026 | Novo preenchimento da LPU pelo técnico: tela própria em 3 passos (serviços, conferência e assinatura), busca sem acento, filtro por classe, itens incluídos um a um com quantidade e condição, aviso da metragem do relatório, observação para a gestão (exibida na aprovação) e declaração obrigatória na assinatura. Correção do nome da classe "Improdutividade". | `agenda.html` |
| 05/10/2026 | Atividades com execução em vários dias (diário por dia, encerramento do dia, conclusão antecipada); pergunta "Você termina hoje?" e pedido de prazo à gestão; relatório da não conclusão antes da LPU parcial. | `agenda.html`, `agenda-lembretes.ts` (deploy), `agenda_ajuste_09` |
| 05/10/2026 | LPU do que foi feito em atividades não concluídas. | `agenda.html` |
| 04/10/2026 | Permissões da gestão por usuário (telas e ações), com validação no banco. | `agenda.html`, `agenda_ajuste_08` |
| 04/10/2026 | Estoque de Materiais incorporado à agenda (importação do bolsão SAP e do Elleven, movimentações, Meu estoque) e perfil Supply Chain. | `agenda.html`, `agenda_ajuste_07`, `index.html` (redirecionamento) |
| 04/10/2026 | Novo menu lateral com logo, grupos recolhíveis e hierarquia por recuo. | `agenda.html` |
| 04/10/2026 | LPU para técnicos CLT e terceiros sem exibição de valores; conferência de cabo (relatório × LPU × ROI) na aprovação; tela Operação → Relatórios; seção Rede executada no Painel. | `agenda.html`, `agenda_ajuste_06` |
| 04/10/2026 | Relatórios fotográficos de lançamento e extensão; regras de liberação da ativação para Firewall e Last mile. | `agenda.html` |
| 04/10/2026 | Nova visão do técnico (cards com cliente e fase em destaque, ação progressiva, bloqueio de atividades simultâneas); materiais editáveis no agendamento; card do dia no calendário. | `agenda.html` |
| 04/10/2026 | Painel de KPIs em seções; budget mensal por conta contábil e detalhamento das LPUs. | `agenda.html`, `agenda_ajuste_05` |
| 03/10/2026 | Relatório de entrega na mesma janela, com download do PDF e retorno automático; correção do envio do relatório. | `agenda.html`, `relatorio-ativacao.html`, `agenda_ajuste_04` |
| 03/10/2026 | Notificações push (rotina e avisos imediatos), app instalável (PWA) e ícones. | `sw.js`, `manifest.webmanifest`, ícones, `agenda-lembretes.ts`, `agenda_ajuste_02` e `03` |
| 03/10/2026 | Primeira versão em produção e ocultação do valor mensal para técnicos. | `agenda.html`, `agenda_implantacao_supabase.sql`, `agenda_ajuste_01` |
