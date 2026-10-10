# Ferramenta de Gestão O&M — Net Turbo Telecom

(Antes chamada **Agenda de Implantação**. O arquivo principal continua `agenda.html`, para não mudar o endereço nem o app já instalado nos celulares.)

Sistema web de gestão das atividades de campo de O&M em duas categorias: **Implantação** e **GTD Manutenção** (chamados do NOC para equipamentos em clientes). Na Implantação: agendamento das fases de construção de circuitos, execução pelos técnicos no celular, relatórios fotográficos, LPU (lista de preços unitários) com assinatura digital, aprovação financeira, controle de estoque dos técnicos e indicadores de desempenho. No GTD Manutenção: chamados criados a partir do texto do NOC, Kanban, agenda, despacho, validação pelo NOC, MTTR e SLA, RFO, LPU com conta fixa de Manutenção cliente, relatórios por cliente e KPIs. As duas categorias têm mensagens (chat com fotos) e o sino de avisos.

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
   ├─ Postgres ........ tabelas ag_* (Implantação, GTD, mensagens, avisos), estoque, permissões, com RLS
   ├─ Storage ......... bucket privado "agenda" (anexos, PDFs de LPU, relatórios, fotos)
   ├─ Realtime ........ atualização ao vivo das telas
   ├─ Edge Function ... "agenda-lembretes" (Deno): notificações push
   ├─ pg_cron ......... dispara a função a cada 10 minutos
   └─ pg_net + triggers  avisos imediatos (atividade nova, remarcada, pedido de prazo, chamados do GTD, mensagens)
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
| `agenda.html` | Aplicação principal, a Ferramenta de Gestão O&M (todas as telas da gestão, do NOC, do Delivery e dos técnicos, nas categorias Implantação e GTD Manutenção). Aproximadamente 595 KB. |
| `relatorio-ativacao.html` | Relatório de Entrega de Circuito (ativação). Abre na mesma janela a partir da agenda, com o mesmo visual das telas do técnico (barra "Voltar para a atividade", cartão do cliente, seções numa única página e progresso de itens preenchidos). Gera o PDF no modelo original, envia ao Storage e retorna para a atividade. Nenhum item é obrigatório. |
| `sw.js` | Service worker: recebe e exibe as notificações push e abre a atividade ao tocar. Não faz cache de páginas. |
| `manifest.webmanifest` | Manifesto PWA (nome, ícones, cores, `id` do app). Permite instalar no celular e no computador. |
| `icon-192.png`, `icon-512.png` | Ícones do app (símbolo da Net Turbo). |
| `armazenamento.html` | Espaço de armazenamento do projeto da agenda (só coordenador, aberto por **Usuários e acessos → Espaço de armazenamento**): uso de arquivos e banco frente ao plano Pro (100 GB de arquivos, 8 GB de banco), tamanho por pasta e compactação das fotos já enviadas pela agenda (regrava no mesmo caminho, 1280 px, JPEG 60%). |
| `index.html` | Redirecionamento do endereço antigo do Estoque de Materiais para `agenda.html` (aplicar só depois de desligar o sistema antigo). |
| `README.md` | Este documento. |

**Não versionar no repositório público:**

| Arquivo | Onde vai |
|---|---|
| `agenda_implantacao_supabase.sql` e `agenda_ajuste_01` a `21` (14: GTD Manutenção; 15: mensagens vistas; 16: aceite do despacho; 17: fases feitas por outro técnico; 18: tempos de atendimento e expurgo; 19: LPU dos funcionários pelo administrador; 20: conversa da gestão do GTD; 21: relatórios para o administrador da empresa terceira) | SQL Editor do Supabase (migrações). Os ajustes 02 e 03 contêm o segredo da rotina (`CRON_SECRET`) embutido. |
| `agenda-lembretes.ts` | Código da Edge Function de notificações (pode ficar em repositório privado). |
| `limpeza-arquivos.ts` e `preventivas_retencao_arquivos.sql` | Retenção de 30 dias no **outro projeto** Supabase da organização (preventivas e agendamentos), seção 6.2. O SQL contém o segredo da rotina. |
| `agenda-rota.ts` | Código da Edge Function `agenda-rota` (rota, previsão de chegada e endereço das fotos pelo OpenRouteService). |
| `NAO_SUBIR_NO_GITHUB_segredos_notificacoes.txt` | Segredos da Edge Function (ver seção 6). |
| `agenda_zerar_dados_de_teste.sql` | Script usado uma vez para apagar atividades, LPUs e avisos de teste antes da operação, com cópia de segurança no banco. |
| `agenda_limpar_testes_por_tecnico.sql` | Apaga as atividades e LPUs da Implantação só dos técnicos escolhidos pelo nome (e dos funcionários das empresas escolhidas), com as mensagens, avisos e expurgos dessas atividades, guardando cópia em `bkp_limpeza_ag_agendamentos` e `bkp_limpeza_ag_lpus`. Rodar por partes; a Parte 3 mostra a lista do que será apagado. Não mexe no GTD, nos projetos nem no estoque. |
| `gtd_limpar_testes_por_tecnico.sql` | O mesmo para o GTD Manutenção: apaga os chamados despachados para os técnicos escolhidos, as LPUs desses chamados (apagadas antes do chamado, para não virarem LPU solta da Implantação), mensagens, avisos e expurgos, com cópia em `bkp_limpeza_ag_chamados` e `bkp_limpeza_ag_lpus_gtd`. Não mexe na Implantação nem nos chamados não despachados. |

---

## 3. Bibliotecas externas (carregadas por CDN)

| Biblioteca | Versão | Uso |
|---|---|---|
| `@supabase/supabase-js` | 2 (jsDelivr) | Autenticação, banco, Storage, Realtime e chamada da Edge Function |
| jsPDF | 2.5.1 | Geração de PDFs (LPU, relatórios fotográficos, relatório de não conclusão) |
| jsPDF-AutoTable | 3.5.31 | Tabelas nos PDFs |
| PDF.js | 3.11.174 | Leitura do PDF do ROI no cadastro de projetos |
| PapaParse | 5.4.1 | Leitura dos CSVs do Elleven (estoque) |
| SheetJS (xlsx) | 0.18.5 | Leitura da planilha do bolsão SAP (estoque) e geração das planilhas (.xlsx) das telas |
| JSZip | 3.10.1 | Leitura do KMZ da extensão (etapa 4 do cadastro); carregada só quando um KMZ é enviado |
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
| `ag_lpus` | LPUs enviadas pelos técnicos: itens, total, conta contábil, status, histórico de aprovação, caminho do PDF assinado. A coluna `chamado` liga a LPU a um chamado do GTD (vazia na Implantação); a situação `registrada` é a LPU do CLT no GTD, que não passa por aprovação. |
| `ag_chamados` | Chamados do GTD Manutenção: protocolos O&M e NOC, etiqueta, cliente, cidade, categoria, prioridade, situação, técnico, `agenda_em` (agendado: início do MTTR e do SLA), `validado_em` (gravado pelo banco quando o NOC valida: fim do MTTR) e `dados jsonb` (motivo, endereço, dados técnicos lidos do texto do NOC, tempos, não validações, RFO, histórico). |
| `ag_mensagens` | Mensagens do chat: por chamado (técnico, NOC e O&M) ou por atividade da Implantação (técnico, Delivery e O&M). Autor, nome e papel são gravados pelo banco. Fotos no Storage em `chat/`. `vista_em`/`vista_por` (ajuste 15): quando alguém abre a conversa, as mensagens dos outros ficam vistas. |
| `ag_avisos` | Sino de avisos de cada usuário (lido ou não). Cada aviso novo também é enviado ao celular pela Edge Function. Avisos com mais de 60 dias são apagados. |
| `ag_expurgos` | Expurgos dos Tempos de atendimento: uma linha por atividade com as etapas retiradas das médias (`desloc`, `espera`, `exec`, `rel`), motivo, observação, quem e quando (gravados pelo banco). Lê quem é da gestão; grava quem tem a permissão "Expurgar tempos das atividades" (ajuste 18). |
| `ag_sala` | Conversa da gestão do GTD (ajuste 20): mensagens do grupo (texto, foto em `chat/g/sala/`, chamado citado em `chamado`), com autor, nome e papel gravados pelo banco. Lê e escreve só quem é da gestão do GTD ou do NOC. |
| `ag_sala_vistos` | Até onde cada pessoa leu a conversa da gestão (`visto_em`), usado no contador de mensagens novas do botão. |
| `ag_expurgos_gtd` | O mesmo de `ag_expurgos` para os chamados do GTD (etapas `desloc`, `espera`, `atend`, `valid`, `rfo`). Lê quem enxerga o GTD; grava quem tem "Expurgar tempos dos chamados" (ajuste 18). |
| `ag_anexos`, `ag_anexos_log` | Anexos dos projetos (KMZ e outros) e log das exclusões automáticas. |
| `ag_budget` | Budget mensal de mão de obra terceirizada por conta contábil. |
| `ag_push`, `ag_notificacoes` | Aparelhos registrados para notificação e controle de avisos já enviados (evita repetição). |
| `agenda_papeis` | Papel de cada usuário na ferramenta (`coordenador`, `supervisor`, `encarregado`, `tecnico`, `supply`, `visualizacao`, `noc`, `delivery`), vínculo (`clt` ou `terceiro`) e permissões personalizadas (`permissoes jsonb`). |

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
| `ag_gtd()`, `ag_valida_gtd()`, `ag_pode_de(usuário, chave)` | Quem enxerga o GTD (coordenador, supervisor, encarregado e NOC; o Delivery não), quem valida chamado (NOC, coordenador e quem tem "Acesso NOC") e permissão de outro usuário (usada para escolher quem recebe cada aviso). |
| `ag_chamado_guard()` | Regras do chamado no banco: o NOC não despacha; o técnico só avança nas etapas dele e não muda despacho, agendamento ou dados; só quem valida tira o chamado de "Aguardando validação"; `validado_em` é gravado pelo banco. |
| `ag_tecnicos_lista()` | Nome e vínculo dos técnicos para o despacho e os filtros do GTD (o NOC não lê `agenda_papeis`). |
| `ag_recusar_chamado(chamado, motivo)` | Recusa do despacho pelo próprio técnico, antes de sair: tira o técnico, guarda o motivo em `dados.recusas` e avisa a gestão (ajuste 16). |
| `ag_minha_equipe()` | Para o administrador de empresa terceira: id, nome e situação dos seus funcionários (ajuste 19). |
| `ag_aviso_equipe_lpu()` | Trigger em `ag_agendamentos` e `ag_chamados`: quando a atividade ou o chamado de um funcionário de terceira chega em LPU, avisa o administrador da empresa ("LPU para preencher", abre Minha equipe) (ajuste 19). |
| `ag_sala_autor()`, `ag_sala_aviso()` | Conversa da gestão do GTD (ajuste 20): gravam autor, nome e papel de cada mensagem e avisam os outros participantes (gestão do GTD e NOC) com um único aviso por pessoa até ela abrir a conversa. |
| `ag_fases_outros_tecnicos()` | Para o técnico: atividades concluídas por outros técnicos nos projetos em que ele tem atividade, só com data, fases finalizadas e nome de quem finalizou (sem valores, relatórios ou LPU). Permite liberar a Ativação quando rua e interno foram feitos por outro técnico (ajuste 17). |
| `ag_marcar_vistas(chamado, atividade)` | Marca como vistas as mensagens dos outros participantes ao abrir a conversa (ajuste 15). |
| `ag_avisar()`, `ag_destinos()`, `ag_chamado_avisos()`, `ag_mensagem_avisos()`, `ag_lpu_gtd_avisos()`, `ag_avisos_push()` | Geram os avisos do sino a cada evento do GTD, mensagem ou LPU do GTD e mandam para o celular (evento `avisos` da `agenda-lembretes`). |

### 4.4 Storage (bucket privado `agenda`)

```
anexos/<etiqueta>/...                     KMZ e anexos dos projetos
lpus/<id do técnico>/...                  PDFs das LPUs assinadas
relatorios/<id da atividade>/...          PDF do relatório de entrega (ativação)
relatorios/<id da atividade>/fotografico/ PDFs dos relatórios fotográficos e de não conclusão
relatorios/<id da atividade>/dias/        fotos do resumo de cada dia (atividades de vários dias)
chat/g/<id do chamado>/...                fotos do chat do GTD Manutenção (o Delivery não lê)
chat/g/<id do chamado>/rfo/...            fotos do atendimento e PDF do relatório do RFO
chat/a/<id da atividade>/...              fotos do chat da Implantação
```

Os arquivos são abertos por URL assinada temporária. As fotos são reduzidas no próprio celular antes do envio (agenda: 1280 px no lado maior, JPEG 60%; relatório de entrega: 1200 px, JPEG 62%), ficando em torno de 150 a 300 KB cada. Limite por arquivo: 50 MB.

A cota de 1 GB é da organização Netturbo no Supabase e soma este projeto (`estoque de materiais`) com o projeto de preventivas e agendamentos (buckets `agendamento-fotos`, `preventivas-pdfs`, `agendamento-pdfs` e de expansão). O coordenador acompanha e reduz o uso da agenda pela tela `armazenamento.html` (seção 9).

**Retenção de 30 dias (outro projeto):** nos buckets `agendamento-fotos` e `preventivas-pdfs` do projeto de preventivas e agendamentos ficam só os arquivos enviados nos últimos 30 dias; o que passa do prazo é apagado todo dia às 03:07 (seção 6.2). Os registros desses sistemas que apontam para arquivos apagados ficam sem a foto ou o PDF. Os buckets da agenda não entram na retenção.

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
12. `agenda_ajuste_11_aviso_lpu.sql` — aviso imediato ao técnico quando a LPU é aprovada, reprovada ou devolvida para ajuste
13. `agenda_ajuste_12_empresa_terceira.sql` — funcionários de empresas terceiras: empresa do funcionário, LPU em conferência pelo administrador, permissões de leitura e gravação dos PDFs da equipe e avisos de LPU para conferir
14. `agenda_ajuste_13_armazenamento.sql` — tela de espaço de armazenamento: funções `ag_sou_coordenador`, `ag_uso_armazenamento` e `ag_arquivos`, e permissão do coordenador para ler, regravar e apagar arquivos do bucket `agenda`
15. `agenda_ajuste_14_gtd_manutencao.sql` — GTD Manutenção: papéis NOC e Delivery, tabelas `ag_chamados`, `ag_mensagens` e `ag_avisos`, coluna `ag_lpus.chamado` e situação `registrada`, regras de validação, avisos do sino e push, pastas `chat/` no Storage e tempo real das tabelas novas. Usa a função `ag_chamar_avisos` do ajuste 03 (não repete o segredo).
16. `agenda_ajuste_15_mensagens_vistas.sql` — mensagens vistas (`vista_em`), função `ag_marcar_vistas` e `ag_painel_dia` com a contagem de mensagens novas do técnico (selo no Painel do dia).
17. `agenda_ajuste_16_aceite_despacho.sql` — aceite e recusa do despacho no GTD: função `ag_recusar_chamado` (o técnico sai do chamado, que volta para Não despachados com o motivo), regra no `ag_chamado_guard` e aviso "Chamado recusado pelo técnico" para a gestão.
18. `agenda_ajuste_17_fases_outros_tecnicos.sql` — função `ag_fases_outros_tecnicos`: o técnico passa a enxergar as fases já finalizadas por outro técnico no mesmo projeto (só leitura), para não ter a Ativação bloqueada.
19. `agenda_ajuste_18_tempos_expurgo.sql` — Tempos de atendimento: tabelas `ag_expurgos` (Implantação: `desloc`, `espera`, `exec`, `rel`) e `ag_expurgos_gtd` (GTD: `desloc`, `espera`, `atend`, `valid`, `rfo`) com as regras de acesso, e permissões novas `p_tempos`, `a_expurgo`, `g_tempos` e `a_gExpurgo` (padrão do supervisor recebe todas; encarregado não; Delivery e NOC nunca veem as do GTD).
20. `agenda_ajuste_19_lpu_pelo_administrador.sql` — LPU dos funcionários de empresa terceira feita pelo administrador: o administrador passa a ver e atualizar as atividades e os chamados dos seus funcionários (`ag_sou_adm_de`), a enviar a LPU em nome deles (técnico = funcionário, prestador = administrador, situação "aguardando"), função `ag_minha_equipe` e trigger `ag_aviso_equipe_lpu` com o aviso "LPU para preencher".
21. `agenda_ajuste_20_conversa_gestao_gtd.sql` — Conversa da gestão do GTD: tabelas `ag_sala` (mensagens, com chamado citado opcional) e `ag_sala_vistos` (até onde cada pessoa leu), regras de acesso (só coordenação, supervisão, encarregados e NOC; técnicos e Delivery não veem), triggers `ag_sala_autor` e `ag_sala_aviso` e tempo real.
22. `agenda_ajuste_21_relatorios_para_administrador.sql` — regra de leitura no Storage (`agenda_st_select_adm`, somada às existentes) para o administrador da empresa terceira abrir e baixar os relatórios das atividades dos seus funcionários (`relatorios/<atividade>/`) e o relatório do atendimento e as fotos do RFO dos chamados deles (`chat/g/<chamado>/rfo/`). Requer o ajuste 19.

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
| Técnico terceiro (administrador da empresa) | Igual ao CLT, mais Gestão financeira (LPUs e totais) da empresa inteira e a tela **Minha equipe** (quando tem funcionários): o que cada funcionário está fazendo e as LPUs dos funcionários para preencher. Recebe o aviso "LPU para preencher" quando um funcionário termina. |
| Funcionário de empresa terceira | Igual ao CLT, **sem LPU e sem Gestão financeira** (desde 10/10). Ao terminar a atividade e enviar os relatórios (ou o RFO, no GTD), a atividade fica "Com o administrador", que preenche a LPU pela tela Minha equipe (`agenda_papeis.empresa`). |
| NOC | Só GTD Manutenção: Chamados (Kanban), Agenda, Criar chamado e Relatórios. Cria chamados, conversa com o técnico e **valida** o atendimento. Não despacha. Recebe avisos de despacho, saída, chegada e pedido de validação. |
| Delivery | Só Implantação, com as telas e ações que a coordenação liberar em Permissões (padrão: Painel do dia e Agenda), como encarregado e supervisor. Conversa com o técnico pelo chat da atividade. **Nunca vê o GTD Manutenção** (regra também no banco). |

**Categorias:** quem tem telas da Implantação e do GTD vê no topo do menu a troca **Implantação | GTD Manutenção**; os grupos do menu (Acompanhamento, Operação, Financeiro) mostram as telas da categoria escolhida. O técnico vê os chamados do GTD e as atividades da Implantação juntos em Minhas atividades.

**GTD na matriz de permissões (supervisor e encarregado):** Painel de KPIs do GTD → Financeiro do GTD → Budget e consumo, Detalhamento das LPUs e Aprovação de LPU do GTD (ação: aprovar); Chamados (ações: despachar; agendar, editar e cancelar; **Acesso NOC: validar chamados**), Agenda do GTD, Criar chamado e Histórico do GTD. Definir o budget usa a mesma permissão da Implantação ("Definir o budget do mês"). Padrão do supervisor: tudo, menos validar. Padrão do encarregado: chamados, despacho, edição, agenda, criar, relatórios e validar (sem painel e sem financeiro). A coordenação define quem tem o Acesso NOC.

A coordenação pode personalizar, por usuário, as telas e ações da gestão em **Usuários e acessos → Permissões**. Usuários novos de gestão (inclusive Delivery) começam sem nenhuma tela. As ações sensíveis (aprovar LPU, definir budget, importar estoque, saldo base) também são validadas no banco por `ag_pode()`.

O login é por e-mail e senha no Supabase Auth; novos cadastros ficam pendentes até a coordenação aprovar e atribuir um papel.

---

## 6. Notificações push (Edge Function `agenda-lembretes`)

**Implantação:** Supabase → Edge Functions → `agenda-lembretes` → colar o conteúdo de `agenda-lembretes.ts` → Deploy.

**Avisos do sino (ajuste 14):** cada linha nova de `ag_avisos` chama a função com o evento `avisos`, que envia a notificação ao celular do destinatário (chamado novo, despacho, saída, chegada, pedido de validação, validado ou não validado, agendamento alterado, LPU do GTD para aprovar, mensagens). A notificação da decisão da LPU do GTD abre o chamado. Depois de rodar o ajuste 14, refazer o deploy da função com o `agenda-lembretes.ts` novo. A verificação de JWT ("Enforce JWT Verification") fica **desligada**; a função valida o usuário (teste) ou o segredo da rotina (`x-cron-secret`).

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

**Avisos imediatos (via trigger):** atividade nova, remarcada, transferida e cancelada (técnico); pedido de prazo (coordenador e encarregados); resposta ao pedido (técnico); LPU aprovada, reprovada ou devolvida para ajuste, com quem decidiu e o motivo (técnico e, se for funcionário de terceira, também o administrador da empresa); LPU para conferir (administrador da empresa terceira).

Cada aviso é enviado uma única vez por atividade e por dia (`ag_notificacoes`). No iPhone, as notificações exigem que o app seja adicionado à Tela de Início.

---

## 6.1 Localização das fotos (Edge Function `agenda-rota`)

**Implantação:** Supabase → Edge Functions → criar `agenda-rota` → colar o conteúdo de `agenda-rota.ts` → Deploy, **com** a verificação de JWT ligada (só usuários logados usam a função). Em Secrets, cadastrar `ORS_API_KEY` com a chave do OpenRouteService.

**Uso atual:** a função faz a busca do endereço a partir das coordenadas (`reverse`), usada no carimbo das fotos. As ações `eta`, `rota` e `geocode` continuam disponíveis, mas a agenda não calcula mais a previsão de chegada automaticamente: o técnico informa a previsão ao iniciar o deslocamento, e o Painel do dia mostra "Chegando em cerca de 5 minutos" a partir desse horário. Plano gratuito do OpenRouteService: 1.000 consultas de endereço por dia.

**Carimbo das fotos:** toda foto enviada pela agenda e pelo relatório de entrega recebe, na própria imagem, horário, data e dia da semana, endereço, coordenadas e um código (etiqueta, data, hora e sequência). Fotos da galeria usam a data e o local gravados pelo celular; sem essas informações, o carimbo indica "Foto da galeria, sem localização".

---

## 6.2 Retenção de arquivos no projeto de preventivas e agendamentos

Não faz parte do projeto da agenda: roda no **outro projeto** Supabase da organização (o de `agendamento-fotos` e `preventivas-pdfs`), mas fica documentado aqui porque divide a mesma cota de 1 GB.

**Implantação (tudo nesse outro projeto):**
1. SQL Editor → rodar `preventivas_retencao_arquivos.sql` (tabela `arq_retencao`, função `arq_vencidos` só para a chave de serviço, rotina diária `limpeza-arquivos` no pg_cron e, no fim, a prévia do que será apagado e do que fica). Conferir antes se o código do projeto na linha `url` é o mesmo do endereço do navegador.
2. Edge Functions → Secrets → cadastrar `CRON_SECRET` com o valor do arquivo de segredos (é diferente do segredo do projeto da agenda).
3. Edge Functions → criar `limpeza-arquivos` → colar `limpeza-arquivos.ts` → Deploy **com a verificação de JWT desligada**. Nada é apagado antes deste passo.

**Funcionamento:** o pg_cron chama a função todo dia às 06:07 UTC (03:07 de Brasília). Para cada linha ativa de `public.arq_retencao`, a função lista os arquivos com `created_at` mais antigo que o prazo e apaga pela API do Storage em lotes de 100. O resultado fica em Edge Functions → `limpeza-arquivos` → Logs. Chamada com corpo `{"simular": true}` só conta, sem apagar.

**Mudar o prazo ou desligar:** no SQL Editor desse projeto, `update public.arq_retencao set dias = 60 where bucket = 'preventivas-pdfs';` ou `set ativo = false`. Para incluir outro bucket, inserir uma linha na tabela.

**Compactação:** a retenção não reduz o tamanho das fotos dos últimos 30 dias. Isso depende do sistema que envia as fotos para `agendamento-fotos` reduzi-las no envio, como a agenda já faz. PDFs não são compactados.

---

## 7. Módulos funcionais

- **Coordenada do cliente (10/10):** a etapa 2 do cadastro do projeto (endereço) tem o campo **Coordenada do cliente** (aceita "-22.9056, -47.0608", vírgula decimal ou link do Google Maps), gravado em `ag_complementos.dados.coord`. No celular do técnico, **Ver rota** usa a coordenada como destino; sem coordenada, usa o endereço. O endereço continua obrigatório.
- **Contato do cliente no agendamento (10/10):** contato e telefone só são exigidos ao agendar **Lançamento interno** ou **Ativação**; Lançamento na rua e Extensão de sinal podem ser agendados sem contato.
- **Topologia FWA (10/10):** nova topologia **FWA**, escolhida sozinha quando o texto do projeto menciona "FWA" ou "FWA 5G". Projeto FWA não tem extensão de sinal, lançamento na rua, lançamento interno, metros de cabo nem caixas (a Base de previsão mostra N/A nessas colunas e os valores ficam zerados); só a previsão de ativação. A ativação é liberada direto.
- **Base de previsão:** cadastro de projetos em 3 etapas (leitura automática do PDF do ROI, endereço e dados técnicos), status por fase e regras por topologia (Firewall e Last mile sem lançamento liberam a ativação direto).
- **Ordem da Base de previsão (10/10):** o projeto incluído mais recentemente fica sempre na primeira linha, também depois de recarregar a página (a lista vem do banco ordenada pela data de criação, `ag_projetos.criado_em`, da mais nova para a mais antiga).
- **Layout da Base de previsão (08/10):** tabela editável com cabeçalho agrupado (Projeto, Local e rede, Quantidades, Previsão de dias por fase), etiqueta fixa à esquerda ao rolar para o lado, linhas alternadas, coluna **Total** de dias das fases do projeto e coluna **Cadastro** compacta (Editar + "Falta: ROI, endereço…" ou "Completo"). Filtros **Todos** e **Cadastro incompleto**. A coluna Status saiu (a situação de cada projeto está no Backlog e na Previsão dos projetos).
- **KMZ da extensão (10/10):** o cadastro do projeto ganhou a **etapa 4 — Extensão (KMZ)**, liberada só quando o projeto tem extensão de sinal (pontos de acesso e de derivação diferentes na etapa 3; na etapa 3 aparece **Avançar: extensão (KMZ)**). Nela se envia o **.kmz** (ou .kml) e se informam o **início (A)** e o **término (B)** da extensão — por padrão a localização do ponto de derivação e a do ponto de acesso, ou um ponto escolhido da lista do KMZ. A ferramenta junta as linhas do KMZ numa rede (pontas a até 2,5 m viram o mesmo ponto; uma linha que termina a até 6 m de outra é ligada a ela), liga A e B ao trecho mais próximo e segue o **menor caminho pelas linhas** até B. Mostra os **metros para estender**, um mapa da rota (A, B, caixas numeradas, escala) e os **pontos do KMZ a até 15 m da rota**: os reconhecidos como caixa de emenda pelo nome, pasta ou descrição (CEO, caixa de emenda, emenda, CE-01, CX-01, fusão) vêm marcados e entram na contagem; CTO, poste e outros aparecem desmarcados para conferência. Avisa quando A ou B está a mais de 30 m da rota e quando os pontos não estão ligados pelas linhas. Metros e caixas podem ser ajustados à mão. Ao salvar, os metros vão para a nova coluna **KM de fibra** e as caixas para a coluna **Caixas**; o projeto guarda a rota simplificada e os pontos, e o arquivo vira o anexo **KMZ de extensão** do projeto (`ag_anexos`, pasta `anexos/<etiqueta>/`, substituindo o anterior), que aparece para o técnico na atividade e no agendamento da extensão. Ao reabrir, a rota salva aparece sem reenviar o arquivo, e **Recalcular com o KMZ anexado** refaz o cálculo. O leitor de KMZ (JSZip, cdnjs) só é carregado quando se envia um arquivo.
- **KMZ de lançamento no cadastro (10/10):** na etapa 3 (Informações técnicas), para projetos com lançamento (não aparece em FWA nem Firewall), campo opcional **KMZ de lançamento**: mostra os metros de linhas do arquivo ao lado dos metros do ROI e, ao salvar, anexa ao projeto como **KMZ de lançamento** (substitui o anterior), visível para a equipe nos agendamentos.
- **Exclusão dos KMZ (10/10):** os anexos KMZ de lançamento e KMZ de extensão (antes "KMZ de ativação") ficam no projeto até a **ativação ser concluída** e então são apagados do Storage automaticamente, com registro em "Excluídos após conclusão". Antes, o de lançamento saía ao finalizar rua e interno e o de extensão ao finalizar a extensão. A rota, os metros e as caixas calculados continuam salvos no projeto.
- **Coluna KM de fibra (10/10):** na Base de previsão, grupo Quantidades, em **metros** (rota do KMZ de extensão; editável). N/A em projeto sem extensão de sinal e em FWA.
- **Layout da Previsão dos projetos (08/10):** uma coluna **Projeto** (etiqueta, cliente, cidade, protocolo, topologia e valor) fixa à esquerda, uma coluna por fase com cartão colorido por situação (**Finalizada**, **Agendada**, **Atrasada**, **A agendar** com os dias da base, **Não se aplica**) e a **Previsão de entrega** destacada (Neste mês, Prevista, Entregue ou Sem data). Legenda das cores, indicadores (em aberto, entregas no mês, com fase atrasada, entregues) e filtros Em aberto (padrão), Entrega neste mês, Com fase atrasada, Entregues e Todos.
- **Agenda:** calendário (dia, semana e mês), agendamento por fase, materiais da atividade (editáveis), observações para o técnico, fotos exigidas no relatório, atividades de vários dias ou uma por dia, reagendamento, replicação, anexos com exclusão automática (KMZ de lançamento e de extensão quando a ativação é concluída; outros anexos ao fim da fase vinculada), pedidos de prazo dos técnicos.
- **Técnico (celular):** fluxo deslocamento → chegada → execução → relatório → LPU → encerrada; bloqueio de uma atividade enquanto outra está em campo (deslocamento, no local ou em execução); encerramento por dia; pedido de mais dias; registro de não conclusão com relatório do que foi feito.
- **Relatórios e LPU pendentes não travam (09/10):** o técnico pode iniciar a próxima atividade com relatórios ou LPU de outra ainda por enviar. A atividade nova mostra "Pendências de envio: etiqueta (relatórios/LPU)" e as pendentes continuam na lista dele para enviar depois. Só trava quem ainda está em campo em outra atividade.
- **Relatório de entrega que não chegou (09/10):** na etapa de relatórios, enquanto o relatório de entrega não for recebido, aparece **Enviar o PDF salvo no celular**: o técnico escolhe o PDF que o relatório baixou no aparelho e ele é enviado para a pasta da atividade (`relatorios/<atividade>/`), liberando "Enviar relatório e preencher LPU" sem gerar tudo de novo. Erros mostram o motivo (internet, login de outro usuário, PDF acima de 50 MB). A coordenação pode fazer o mesmo pela Visão do técnico com um PDF recebido do técnico. "Já gerei o PDF: verificar relatório" também mostra o motivo quando a verificação falha. O relatório de entrega não depende das fases do projeto.
- **Ativação sem trava (08/10):** a ativação pode ser agendada, reagendada, replicada e finalizada mesmo com lançamento na rua, interno ou extensão ainda não finalizados. No agendamento, a fase mostra "Atenção: ainda falta finalizar…". Ao concluir, o técnico vê **Finalizar a ativação?** com as fases que faltam e escolhe **Finalizar mesmo assim**; a atividade guarda `dados.ativSemFases` e a gestão vê "Finalizada sem …" no projeto e "sem …" no Backlog. As fases que faltaram continuam pendentes no projeto.
- **Outras atividades (08/10):** além das fases, o agendamento tem **Vistoria de lançamento**, **Validação de link**, **Entrega de equipamento** e **Integração** (chaves `vist`, `vlink`, `equip`, `integ` em `ag_agendamentos.fases`). Seguem o mesmo fluxo do técnico (deslocamento, chegada, execução, LPU), não levam material do ROI, não exigem relatório e não contam como fase do projeto (não liberam nem finalizam etapas). Aparecem nos filtros da Agenda, do Painel do dia e dos Tempos de atendimento, e nos avisos do celular (Edge Function `agenda-lembretes` atualizada).
- **Projeto sem lançamento na rua (08/10):** na etapa 3 do cadastro (Informações técnicas), o campo **Lançamento na rua** marca o projeto como "Não tem: lançamento todo interno" (`dados.semRua`). A fase de rua sai do fluxo (não aparece no agendamento, não trava nada e a previsão de rua fica zerada, com N/A na Base de previsão) e o projeto ganha a marca "Sem rua".
- **Terminador e extensão óptica no lançamento interno (08/10):** os itens do ROI com "terminador" ou "extensão óptica" na descrição, mesmo marcados como Ponta B, entram nos materiais da atividade quando o lançamento interno é selecionado (com a nota "vai no lançamento interno") e saem da ativação. Se o projeto não tem lançamento interno, continuam na ativação.
- **Backlog de projetos (Projetos → Backlog de projetos):** mostra só os projetos da base ainda não entregues, em três colunas: **Lançamento externo**, **Lançamento interno** e **Ativação**. Cada projeto fica na primeira dessas fases que falta (projeto sem rua começa no interno; firewall vai direto para Ativação) e sai do backlog quando a ativação é finalizada. A extensão de sinal não tem coluna: aparece no card e, na coluna Ativação, a linha "Fases pendentes: …" ou "Fases anteriores concluídas" mostra se as etapas anteriores foram feitas. Cada card traz a quantidade de trabalho: **cabo a lançar** (metros do projeto menos o lançado informado nos relatórios), **caixas de extensão** (a fazer ou concluída), a **previsão de dias de cada fase** (realizados/previstos, com ✓ nas finalizadas e vermelho quando passa do previsto) e o próximo agendamento. No topo: projetos a entregar, cabo a lançar, caixas de extensão a fazer e dias de campo previstos restantes; no cabeçalho de cada coluna, os metros de cabo e os dias previstos daquela fase. Desde 10/10: indicador **KM de fibra a estender** no topo (soma da coluna KM de fibra dos projetos com extensão ainda não finalizada) e, no card de cada projeto com extensão, o quadro **KM de fibra** com os metros e a situação (a estender, extensão concluída ou sem KMZ de extensão no cadastro). Os números do topo são **filtros**: tocar em Cabo a lançar, Caixas de extensão a fazer, KM de fibra a estender ou Dias de campo previstos mostra só os projetos com aquele trabalho pendente (os totais continuam os do backlog todo); tocar de novo, em Projetos a entregar ou em "Mostrar todos" volta tudo. **Baixar planilha** exporta os projetos da lista como estão (busca, cidade e filtro): aba Projetos (coluna do backlog, dados do projeto, cabo do projeto, lançado e a lançar, caixas, KM de fibra, situação da extensão, dias previstos, realizados e situação de cada fase, dias restantes, próximo agendamento, atraso, liberado para ativar, cadastro e KMZ anexados), aba Indicadores e aba Filtros.
- **Relatórios:** fotográfico de lançamento e extensão (câmera ou galeria, lote, metragem, nível de sinal em dBm), relatório de entrega de circuito (ativação) e relatório de não conclusão. Todos geram PDF guardado na atividade. A tela **Operação → Relatórios** organiza tudo por cliente.
- **LPU:** preenchimento pelos técnicos em tela própria e em 3 passos (serviços, conferência e assinatura), sem exibição de valores. Busca por código ou descrição que ignora acentos e aceita palavras em qualquer ordem, filtro por classe, inclusão item a item com quantidade e condição (comum ou crítica), aviso da metragem registrada no relatório, observação para a gestão e declaração de execução antes de assinar. Gera o PDF assinado. **Equipe própria (CLT), desde 10/10:** o PDF da LPU (no envio, na aprovação e o que o técnico abre em "Abrir PDF da LPU") sai sem valores: só código, descrição, fator, medida e quantidade, com a nota "Equipe própria (CLT): LPU sem valores". Vale também para a LPU registrada do GTD. A gestão (coordenação, supervisão e encarregados) abre a mesma LPU com valores, gerada na hora. Terceiros continuam com o PDF com valores. Aprovação com conferência de cabo (relatório × LPU × ROI) e alertas de divergência.
- **Financeiro:** budget mensal por conta contábil (consumido pelas LPUs aprovadas no mês da aprovação), comparação ROI × LPU e detalhamento por classe e por item.
- **Estoque:** visão por técnico (bolsão SAP + Elleven, comprometido pelos agendamentos), importação da planilha do bolsão e do extrato do Elleven, saldo base, movimentações, e Meu estoque e Meu histórico para os técnicos.
- **Painel do dia (grupo Operação):** visão somente leitura das atividades de hoje, para outros setores e para TV: números do dia, filtro por cidade e por fase (Lançamento na rua, Lançamento interno, Extensão, Ativação; atividade com mais de uma fase aparece em cada uma) e colunas Aguardando início, A caminho, Em execução e Encerradas, com as últimas atualizações enviadas pelo técnico e o selo de circuito entregue. Atividades de vários dias aparecem em cada dia com "dia X de Y"; quando o técnico encerra o dia, o card vai para Encerradas com "Continua amanhã" (ou "Aguardando prazo") e o resumo do dia. Atualiza sozinho a cada minuto.
- **Atualizações do andamento:** durante a execução, o técnico envia quantas atualizações quiser (situação, metragem, comentário e foto), exibidas no Painel do dia e no card da atividade.
- **Painel de KPIs:** visão geral (com a quantidade de **atividades agendadas**, desde 10/10), entregas, rede executada, tempos de atendimento, execução em campo, equipes e financeiro. A seção "Simulação de entrega" foi retirada em 10/10.
- **Planilhas (.xlsx), desde 10/10:** botão **Baixar planilha** em quatro telas, sempre com uma aba **Filtros** (tela, filtros usados, quantidade, data, hora e quem gerou):
  - **Visão geral (Implantação):** abas Indicadores (os mesmos números da tela), Atividades do período (data, etiqueta, cliente, cidade, topologia, fases, técnico e vínculo, situação, atrasada, dentro da previsão, aguardando reagendamento, horários de saída, chegada, início, conclusão, relatórios e encerramento, motivo da não conclusão, cabo do relatório, situação da LPU e o valor, só para a gestão) e Entregas (circuitos ativados no período com dias de execução e valor mensal).
  - **Aprovação de LPU (Implantação e GTD):** exporta as LPUs da aba aberta (Aguardando, Em ajuste, Aprovadas ou Reprovadas) dentro do período escolhido: aba LPUs (dados da atividade ou do chamado, prestador, conta, situação, valor, envio, decisão com quem, quando e motivo, conferência de cabo na Implantação, MTTR no GTD e histórico) e aba Itens (uma linha por serviço, com quantidade, valor unitário e total).
  - **Mão de obra de terceiros: ROI x LPU executada (Financeiro):** aba ROI x LPU (por projeto: terceiros, mão de obra no ROI, LPU aprovada, pendente, total, diferença e % do ROI, com linha de total) e aba LPUs (as LPUs de terceiros que compõem cada projeto, sem as reprovadas, marcando as que estão no período).
  - **Histórico do GTD:** ver seção 7.1.
- **Período na Aprovação de LPU (Implantação e GTD), desde 10/10:** campos **Período por** (data da atividade, data do envio ou data da decisão), **De** e **Até**, e os botões **Este mês** e **Todas as datas**. Os totais e as abas seguem o período. Sem datas, mostra tudo (como antes).
- **Rede executada pela LPU (10/10):** cabo lançado, cordoalha, reaberturas e fechamentos de CEO e extensão de fibra vêm todos das LPUs do período (aguardando aprovação, devolvidas para ajuste e aprovadas; as reprovadas não contam), pela data da atividade. Cabo lançado soma os serviços de lançamento de cabo da LPU (não mais a metragem dos relatórios). Gráfico semanal (equipe própria × terceiros) e tabela por técnico ou prestador com a quantidade de LPUs.
- **Menu lateral no celular (10/10):** recolhe ao tocar fora dele ou em qualquer parte dele (itens, logo, sino, conta), inclusive no item da tela que já está aberta. Só continua aberto ao abrir ou fechar um grupo e ao tocar em Painel de KPIs (Implantação ou GTD), que mostra as subseções; ao escolher a subseção, recolhe.
- **Minha equipe (administrador de empresa terceira, 10/10):** cada card tem **Ver atividade e relatórios** (ou **Ver chamado e RFO**), que abre a consulta só leitura: dados do cliente e do projeto, técnico, linha do tempo, execução por dia, atualizações e fotos, metros lançados, não conclusão, fases do projeto, anexos e os relatórios (fotográfico, de entrega, do que foi feito e LPU) com **Abrir** e **Baixar**; no GTD, linha do tempo, RFO, relatório do atendimento e fotos. Sem editar, cancelar, replicar ou conversar. A leitura dos arquivos depende do ajuste 21. Fica no menu lateral, grupo Campo, logo abaixo de Minhas atividades, com o número de LPUs para preencher; seções **LPU para preencher** (atividades e chamados do GTD dos funcionários; o administrador preenche e assina a LPU, que vai direto para a aprovação do O&M e encerra a atividade), **Em campo agora**, **Fazendo os relatórios**, **Agendadas** e **Concluídas nos últimos 30 dias**, com filtro por funcionário. O aviso "LPU para preencher" no sino e no celular abre essa tela. LPUs de funcionários que já estavam "Para conferir" antes de 10/10 continuam na Gestão financeira do administrador.
- **Tempos de atendimento (Painel de KPIs):** separa o tempo de cada atividade concluída em quatro etapas: **Deslocamento** (saída até a chegada), **Espera no cliente** (chegada até o início), **Atividade** (início até a conclusão; em atividade de vários dias, soma os dias) e **Relatório** (da conclusão até o técnico tocar em enviar os relatórios; o horário do envio fica em `dados.ts.relatorios` e passou a ser gravado em 08/10/2026, então atividades anteriores aparecem como "sem registro" e ficam fora da média do relatório; atividade que não exige relatório aparece como "não exige" e ainda em relatórios, como "pendente"). Filtros por fase (padrão: Ativação), técnico, cliente (nome, etiqueta ou protocolo) e período. Mostra médias de cada etapa, total médio por atividade (soma das etapas consideradas, com o relatório quando medido), horas somadas, a composição do tempo e tabelas por técnico e por cliente com linha de total. Etapas fora do padrão ficam marcadas com "!" (sem registro, deslocamento de até 1 min, atividade de até 5 min, acima do limite — deslocamento 4h, espera 3h, atividade 12h, relatório 24h — ou acima de 3 vezes a mediana do filtro). Com a permissão **Expurgar tempos das atividades**, a gestão retira uma ou mais etapas de uma atividade das médias e somas, com motivo; a etapa fica riscada e o expurgo pode ser desfeito. O expurgo fica em tabela própria (`ag_expurgos`), não altera a atividade e não é sobrescrito pelo celular do técnico. **Baixar planilha** gera um .xlsx com os tempos filtrados, alertas e expurgos.
- **Mensagens (as duas categorias):** botão **Mensagens (n)** no chamado e na atividade abre o chat em tela cheia, com "Voltar". GTD: técnico, NOC e O&M; Implantação: técnico, Delivery e O&M. Texto e foto pelos botões **Câmera** (abre a câmera do celular) e **Galeria**, reduzida para 1280 px, JPEG 60%. No computador, **Enter envia** e **Shift + Enter** pula linha; no celular, o Enter do teclado pula linha. Com a conversa aberta, as mensagens novas aparecem na hora (tempo real, com conferência a cada 5 segundos). Cada mensagem avisa os outros participantes.
- **Selo de mensagem nova do técnico:** número em vermelho no card da atividade no **Painel do dia** (inclusive no perfil Visualização) e no cartão do Kanban do GTD. Tocar no selo abre a conversa; quando qualquer pessoa abre a conversa, as mensagens ficam vistas e o selo some para todos.
- **Sino de avisos (as duas categorias):** no menu e na barra do celular, com o número de não lidos; tocar no aviso abre o chamado, a atividade ou a conversa. Desde 10/10 a lista mostra **só os avisos não lidos** (gestão e técnicos): ao abrir um aviso ou marcar como lido, ele sai da lista. Os mesmos avisos chegam no celular como notificação.

### 7.1 GTD Manutenção

- **Criar chamado (NOC e gestão):** colar a "Solicitação de deslocamento" do NOC e tocar em **Ler chamado**; o texto preenche cliente, etiqueta, cidade, protocolos, equipamento, porta, OLT, banda, dados IP/PPPoE, tipo de entrega, material a levar, contato, janela, localização e observações (senhas ficam só no chamado). **Quando atender:** Atendimento hoje ou Agendado (data e horário). Categoria em lista (com a sugerida pelo motivo): Indisponibilidade, Verificação / qualidade do link, Troca de equipamento, Equipamento / energia, Wi-Fi, Gerência, Instalação / last mile. Prioridade: Normal, Alta ou Escalonado. Motivo em texto livre por enquanto. Alertas de protocolo O&M repetido, reincidência (mesma etiqueta em 30 dias), mesmo endereço de chamado aberto, campos não encontrados e possível improdutiva. O chamado entra em **Não despachados** e avisa a gestão.
- **Técnico, lista:** em Minhas atividades, os chamados do GTD têm a mesma visão da Implantação: **Hoje**, **Próximas** (agendados para outro dia) e **Encerradas** (com acesso ao chamado, RFO e LPU depois de encerrado).
- **Aceite do despacho:** depois do despacho, o técnico vê **Aceitar** ou **Recusar**. Só depois de aceitar aparece Iniciar deslocamento. Na recusa ele escolhe o motivo (outro atendimento, fora da região, sem material, fora do horário ou outro, com detalhes); o chamado volta para Não despachados com a marca "Recusado por…" e a gestão do GTD recebe o aviso no sino e no celular. Um novo despacho pede novo aceite.
- **Kanban:** Não despachados, Despachados (com a marca **Aguardando aceite** ou **Aceito às hh:mm**), Em deslocamento (com "chega por volta das"), No local · em atividade, Aguardando validação e Encerrados hoje. Busca por O&M, cliente, etiqueta ou técnico. O cartão mostra a categoria com uma cor própria, o botão **Chat** (desde 10/10; abre a conversa do chamado direto do cartão, com o número de mensagens e o destaque das novas), agendamento, prioridade, SLA, reincidência, mesmo endereço, técnico, cidade e MTTR.
- **Chamado (gestão e NOC):** despacho por lista (CLT e terceiros) e botão **Despachar** (só gestão), agendamento, validação (**Validado** ou **Não validado** com motivo, só NOC e quem tem Acesso NOC), linha do tempo, dados do chamado, RFO com **Copiar para o WhatsApp**, LPU, editar e cancelar.
- **Fotos no RFO:** o técnico adiciona quantas fotos precisar (botões Câmera e Galeria, com legenda), com o mesmo carimbo de data, hora e local das fotos da Implantação. Ao gerar o RFO, a ferramenta monta o **Relatório do atendimento (PDF)**, com os dados do chamado, o RFO e as fotos, aberto pelo chamado, pelos relatórios e pela aprovação de LPU. O rascunho do RFO com as fotos fica guardado no aparelho até ser gerado.
- **Técnico:** aceite, previsão de chegada e **Iniciar deslocamento**, **Cheguei no cliente**, **Iniciar atendimento**, **Pedir validação ao NOC** (sem desfecho). Não validado volta para o técnico com o motivo e o MTTR continua. Depois da validação: **RFO** (desfecho Resolvido, Improdutivo ou Encaminhado com a equipe; localização da falha; causa; detalhes; materiais; serial retirado e instalado; patrimônio; solução; melhoria de rede), que gera o texto no formato do WhatsApp, e a **LPU** na mesma tela de 3 passos da Implantação, com a conta **fixa** 3.1.1.2.05.0006 (Manutenção cliente, sem opção de troca) e os itens dessa conta. CLT: LPU registrada, sem valores, sem aprovação e sem gestão financeira; o chamado encerra. Terceiro: LPU com valores para a aprovação e na Gestão financeira; funcionário de terceiro passa pela conferência do administrador.
- **MTTR e SLA:** contam da criação (Atendimento hoje) ou do horário agendado até a validação do NOC. SLA de 4 horas para Indisponibilidade (demais categorias a definir).
- **Agenda:** Dia, Semana e Mês, ‹ Hoje ›, data e filtro de técnico (inclui Não despachados), como na Implantação.
- **Painel de KPIs (grupo Acompanhamento), igual à Implantação:** o item abre **Visão geral**, **Tempos de atendimento** e **Financeiro**; o Financeiro abre **Budget e consumo**, **Detalhamento das LPUs** e **Aprovação de LPU**.
  - **Budget e consumo:** budget do mês da conta 3.1.1.2.05.0006 (Manutenção cliente), definido ali mesmo (mesma tabela e permissão do budget da Implantação); consumido pelas LPUs aprovadas no mês da aprovação (inclui LPUs da Implantação nessa conta), disponível, aguardando aprovação, aprovado por categoria e por prestador. LPUs registradas pela equipe própria não consomem budget.
  - **Detalhamento das LPUs:** filtros de período, técnico e situação (aprovadas, aguardando, registradas pela equipe própria); valor por classe, 10 itens mais usados e quantidade e valor por item.
  - **Aprovação de LPU:** mesmo layout da Implantação (totais, abas, cartões com itens, dados do chamado, RFO, histórico, Abrir chamado, Reprovar, Devolver para ajuste e Aprovar com motivo). Aprovada ou reprovada, o chamado encerra.
- **Histórico (gestão e NOC; antes "Relatórios", renomeado em 10/10):** em lista por cliente, como os relatórios da Implantação: filtros de busca, categoria, técnico e período; cada cliente abre a tabela com data, chamado, categoria e motivo, técnico, desfecho, MTTR, LPU, **Ver RFO** e **Abrir chamado**. No topo, um **resumo do período** com chamados no período, clientes, validados/encerrados, em aberto, cancelados, reincidentes e improdutivos; os números seguem a busca, a categoria, o técnico e as datas escolhidas. **Baixar planilha** gera um .xlsx com os chamados exatamente como estão na lista (período, busca, categoria, técnico e filtro de situação): aba **Chamados** com data, O&M, protocolo NOC, cliente, etiqueta, cidade, categoria, motivo, prioridade, técnico e vínculo, situação, desfecho, motivo do cancelamento, reincidente e chamado anterior, horários (abertura, agendamento, despacho, saída, chegada, início, validação pedida, validado, RFO), MTTR em horas, dados do RFO (local da falha, causa, detalhes, solução, materiais, seriais, patrimônio, melhoria) e situação da LPU, com o valor só para coordenação, supervisão e encarregados (LPUs de terceiros); aba **Filtros** com os filtros usados. Os números são clicáveis: tocar em **Em aberto**, **Validados / encerrados**, **Cancelados**, **Reincidentes** ou **Improdutivos** mostra só esses chamados (o filtro fica destacado, os clientes abrem já expandidos e os totais continuam visíveis); tocar de novo, em **Chamados no período** ou em "Mostrar todos" volta a lista completa. Desde 10/10 mostra também os **chamados cancelados** (desfecho "Cancelado" com o motivo, MTTR "—"). No cabeçalho do cliente: quantidade de reincidências e de cancelados; na linha, o selo **Reincidente** só nos chamados que têm outro anterior da mesma etiqueta.
- **Reincidência (regra de 10/10):** um chamado é reincidente quando existe outro chamado **anterior**, não cancelado, da mesma etiqueta, aberto até 30 dias antes. O primeiro chamado nunca leva o selo; quando dois chamados têm o mesmo horário de criação, o de menor protocolo O&M conta como o primeiro. Vale para o Kanban, o chamado, o Histórico e o indicador da Visão geral.
- **Tempos de atendimento (GTD):** a mesma visão da Implantação, com cinco etapas por chamado: **Deslocamento** (saída até a chegada), **Espera no cliente** (chegada até o início do atendimento), **Atendimento** (início até o pedido de validação; se o NOC não validou e o técnico voltou ao atendimento, conta até o último pedido), **Validação do NOC** (pedido até a validação) e **RFO** (validação até o RFO gerado). Usa os horários que o GTD já grava desde o início, então os chamados antigos já entram. Considera chamados validados (RFO, LPU, aprovação ou concluídos) com abertura no período; RFO ainda não gerado aparece como "pendente". Filtros de período, categoria, técnico e cliente (nome, etiqueta, protocolo O&M ou NOC); médias, total médio por chamado, horas somadas, composição e tabelas por técnico, por cliente e por categoria, com total. Fora do padrão: deslocamento até 1 min ou acima de 4h, espera acima de 3h, atendimento até 3 min ou acima de 10h, validação do NOC acima de 4h, RFO acima de 24h, ou acima de 3 vezes a mediana. Expurgo por etapa com motivo (permissão **Expurgar tempos dos chamados**), gravado em `ag_expurgos_gtd`, e planilha.
- **Visão geral:** chamados, em aberto, MTTR médio, tempo até o despacho, SLA de indisponibilidade, reincidências, improdutivos e encaminhados (indicadores em 4 colunas). Layout de 10/10: **Por categoria** (com MTTR), **Por desfecho** (%), **Por cidade** (10 maiores, %) lado a lado e **Por técnico** em tabela larga (vínculo, barra de chamados, em aberto, resolvidos, improdutivos e MTTR), além das indisponibilidades em andamento. "Por OLT" e "CLT x terceiros" saíram.
- **Chat com NOC / Chat com O&M (10/10):** botão no topo de Chamados, chamado **Chat com NOC** para a gestão O&M e **Chat com O&M** para o NOC (com o número de mensagens novas) abre um chat em grupo, em tela cheia, entre a gestão do GTD (coordenação, supervisão, encarregados) e o NOC, para combinar prioridades. Técnicos e Delivery não veem. Layout de grupo de WhatsApp: cor e iniciais por pessoa, nome e papel, divisórias Hoje/Ontem/data, horário em cada mensagem, fotos (Câmera e Galeria) e Enter para enviar. Cada mensagem pode **citar um chamado** (pelo botão Citar da lista "Chamados em aberto" ao lado, ordenada por prioridade, ou por "Citar chamado…" no celular); o chamado citado aparece como cartão com situação e prioridade e abre o chamado ao tocar. No chamado, os botões são **Chat com técnico** (a conversa do chamado com o técnico, antes "Mensagens") e **Chat com NOC** (gestão) ou **Chat com O&M** (NOC), que abre o grupo com o chamado já citado. Os outros participantes recebem um aviso "Chat com NOC" ou "Chat com O&M" no sino e no celular; enquanto não abrirem a conversa, as mensagens seguintes só atualizam esse aviso (sem notificação repetida). Mostra as últimas 300 mensagens. O botão Chat do cartão do Kanban continua sendo a conversa do chamado com o técnico.
- **Funcionário de terceira no GTD (10/10):** depois do RFO, o funcionário vê "A LPU deste chamado é preenchida pelo administrador da sua empresa"; o administrador recebe o aviso e preenche pela tela Minha equipe.
- **Isolamento da Implantação:** os dados do GTD ficam em tabelas próprias e são gravados direto, ação a ação; não entram no salvamento automático da Implantação. Se o ajuste 14 ainda não tiver sido rodado, as telas do GTD mostram o aviso e a Implantação continua normal.

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

- **Plano do Supabase (Pro, desde 08/10/2026):** 100 GB de arquivos para a organização, 8 GB de banco por projeto, 250 GB de tráfego por mês, backup diário guardado por 7 dias e sem pausa por inatividade. Custa a partir de US$ 25/mês; cada projeto além do primeiro custa a partir de US$ 10/mês (a organização tem dois: este e o de preventivas e agendamentos). O limite de gastos vem ligado: ao chegar no incluído, o Supabase não cobra a mais. As medidas de economia continuam valendo e não precisam ser desfeitas: fotos novas reduzidas (seção 4.4), compactação em `armazenamento.html` e retenção de 30 dias no projeto de preventivas (seção 6.2).
- **Segredos nos scripts:** os ajustes 02 e 03 gravam o `CRON_SECRET` dentro de funções do banco. Em produção, a recomendação é migrar esse valor para o Supabase Vault.
- **Chave pública no front-end:** a chave `anon` é pública por natureza; a proteção dos dados depende das políticas RLS, que precisam ser preservadas em qualquer migração.
- **Alteração que não chega ao banco:** sem login válido, o banco ignora a alteração sem devolver erro (regra de segurança RLS). O app confere se a atividade foi de fato gravada e avisa o técnico. Para conferir no banco: `select status, dados->'ts', atualizado_em from ag_agendamentos where etiqueta = 'ETIQUETA';`.
- **Permissões novas (Tempos de atendimento):** supervisores sem permissões personalizadas recebem a seção e o expurgo automaticamente. Quem tem permissões personalizadas salvas (inclusive usuários novos) só vê a seção depois que a coordenação marcar **Tempos de atendimento** e **Expurgar tempos das atividades** (Implantação) e **Tempos de atendimento do GTD** e **Expurgar tempos dos chamados** (GTD) em Usuários e acessos → Permissões.
- **Fases feitas por técnicos diferentes:** o técnico só lê as próprias atividades; as fases finalizadas por outro técnico no mesmo projeto chegam pela função `ag_fases_outros_tecnicos` (ajuste 17). Sem esse script no banco, a Ativação fica bloqueada para quem não fez rua e interno. Para conferir as fases de um projeto: `select tecnico, status, dados->'fasesFin', dados->'ts'->'conclusao' from ag_agendamentos where etiqueta = 'ETIQUETA';`.
- **Envio da LPU:** a LPU é gravada direto no banco, com confirmação, antes de encerrar a atividade (as demais alterações continuam no salvamento automático, alguns décimos de segundo depois). Para conferir se uma LPU chegou: `select id, status, criado_em from ag_lpus where etiqueta = 'ETIQUETA';`.
- **LPU em nome de outro usuário:** por regra de segurança, o banco só aceita LPU enviada pelo próprio técnico. Testes feitos pela "Visão do técnico" da coordenação não geram LPU.
- **Chat com NOC / O&M (ajuste 20):** sem o ajuste 20, o botão aparece, mas a conversa mostra "Rode o script agenda_ajuste_20…" e nada é gravado. Quem participa segue as mesmas regras do aviso de chamado novo: coordenação, supervisores e encarregados com a tela Chamados do GTD e o NOC.
- **LPU pelo administrador (ajuste 19):** sem o ajuste 19 no banco, o administrador não vê as atividades dos funcionários, não grava a LPU deles e não recebe o aviso. Rodar o ajuste antes de publicar o `agenda.html` novo.
- **PDFs antigos de LPU de CLT:** os PDFs guardados antes de 10/10 têm valores e continuam no Storage (`lpus/<técnico>/`). A ferramenta não os mostra mais ao técnico CLT (ele sempre recebe a versão sem valores, gerada na hora).
- **Dependência de CDNs:** ver seção 3.
- **Volume do GTD:** a tela carrega todos os chamados (o histórico por cliente precisa deles). Com alguns milhares de chamados, avaliar carregar só o último ano e buscar o histórico do cliente sob demanda. A contagem de mensagens considera os últimos 120 dias.
- **Chave do OpenRouteService:** fica só nos segredos do Supabase. Se a chave for exposta, gere outra no painel do OpenRouteService e atualize o segredo.

---

## 10. Teste rápido após publicar

1. Entrar como coordenador e conferir o menu (Acompanhamento, Operação, Estoque, Projetos, Campo, Administração) e a troca Implantação | GTD Manutenção.
2. Cadastrar um projeto de teste, agendar uma fase para um técnico de teste e confirmar a notificação de "Nova atividade".
3. No celular do técnico: iniciar deslocamento, chegar, iniciar, concluir, enviar o relatório fotográfico e a LPU.
4. Na gestão: abrir **Financeiro → Aprovação de LPU**, conferir os relatórios e aprovar.
5. Em **Estoque → Atualizar estoque**, publicar uma planilha do bolsão e conferir em **Movimentações**.
6. Em Supabase → Edge Functions → `agenda-lembretes` → **Logs**, confirmar as execuções a cada 10 minutos.
7. GTD: com um usuário NOC, criar um chamado colando o texto do NOC; na gestão, despachar; no celular do técnico, seguir até pedir validação e mandar uma mensagem com foto; no NOC, validar; no técnico, gerar o RFO e a LPU. Conferir os avisos no sino e no celular.

---

## 11. Histórico de alterações

Registro das mudanças no código. A cada alteração, este README é atualizado e a entrada correspondente é incluída no topo desta lista.

| Data | Alteração | Arquivos e passos |
|---|---|---|
| 10/10/2026 | Minha equipe: o administrador da empresa terceira consulta a atividade ou o chamado de cada funcionário (só leitura) e abre ou baixa os relatórios, RFO, fotos e LPU. | `agenda.html`, `agenda_ajuste_21` (rodar antes) |
| 10/10/2026 | Correção: **Minha equipe** não aparecia no menu lateral do administrador de empresa terceira (só abria pelo aviso); agora fica no grupo Campo com o contador de LPUs para preencher. Menu lateral do celular recolhe ao tocar fora ou em qualquer item. | `agenda.html` |
| 10/10/2026 | Base de previsão: projeto novo sempre na primeira linha (ordem por data de criação, da mais nova para a mais antiga, também ao reabrir a ferramenta). | `agenda.html` |
| 10/10/2026 | Backlog de projetos: os números do topo viram filtro e botão **Baixar planilha** (.xlsx com os projetos filtrados, indicadores e filtros). | `agenda.html` |
| 10/10/2026 | KMZ: o da etapa 4 vira o anexo **KMZ de extensão** do projeto (antes "KMZ de ativação"), visível para a equipe no agendamento da extensão; a etapa 3 do cadastro aceita o **KMZ de lançamento** (anexado ao projeto); os dois KMZ são apagados do Storage quando a ativação é concluída. Backlog com **KM de fibra a estender** no topo e KM de fibra em cada card. | `agenda.html` |
| 10/10/2026 | Base de previsão: coluna **KM de fibra** (metros) e **etapa 4 — Extensão (KMZ)** no cadastro, liberada só para projeto com extensão de sinal: lê o KMZ, calcula a rota entre o início e o término da extensão pelas linhas do arquivo, os metros e as caixas de emenda no caminho, com mapa e conferência dos pontos; grava os valores nas colunas KM de fibra e Caixas e o arquivo no Storage. | `agenda.html` |
| 10/10/2026 | Planilhas (.xlsx) na Visão geral do Painel de KPIs da Implantação, na Aprovação de LPU da Implantação e do GTD (LPUs e itens) e na Mão de obra de terceiros: ROI x LPU executada. Filtro de período (data da atividade, do envio ou da decisão) na Aprovação de LPU da Implantação e do GTD. Selos dentro dos cartões de LPU deixam de ocupar a linha inteira. | `agenda.html` |
| 10/10/2026 | Histórico do GTD: botão **Baixar planilha** (.xlsx com os chamados filtrados, horários, MTTR, RFO e LPU, mais a aba com os filtros usados). | `agenda.html` |
| 10/10/2026 | Histórico do GTD: os números do resumo viram filtro (em aberto, validados/encerrados, cancelados, reincidentes, improdutivos). | `agenda.html` |
| 10/10/2026 | Histórico do GTD com resumo do período no topo (chamados, clientes, validados/encerrados, em aberto, cancelados, reincidentes e improdutivos), acompanhando os filtros. | `agenda.html` |
| 10/10/2026 | GTD: a tela **Relatórios** passa a se chamar **Histórico** e mostra também os chamados cancelados (com o motivo). Selo **Reincidente** só do segundo chamado em diante: o primeiro chamado da etiqueta também era marcado quando dois chamados tinham o mesmo horário de criação, e o cabeçalho do cliente no Histórico marcava o grupo inteiro; agora o selo fica na linha de cada chamado reincidente. | `agenda.html` |
| 10/10/2026 | LPU da equipe própria (CLT) sem valores no PDF, na Implantação e no GTD: o PDF guardado no envio e na aprovação e o que o técnico abre não mostram valor unitário, subtotal nem total; a gestão abre a versão com valores gerada na hora. Terceiros sem mudança. | `agenda.html` |
| 10/10/2026 | Nomes dos chats do GTD: o grupo da gestão com o NOC passa a se chamar **Chat com NOC** (gestão O&M) e **Chat com O&M** (NOC), também no aviso; no chamado, "Mensagens" vira **Chat com técnico** e "Discutir com a gestão" vira Chat com NOC / Chat com O&M. Correção: a caixa "O técnico pediu validação" do NOC aparecia com letras grandes e texto saindo da caixa; selo azul de situação com espaço extra. | `agenda.html`, `agenda_ajuste_20` |
| 10/10/2026 | **Conversa da gestão** no GTD: chat em grupo da gestão do GTD com o NOC (botão em Chamados, contador de novas, citação de chamado, lista de chamados em aberto por prioridade, fotos, aviso no sino e no celular sem repetir notificação). Botão **Discutir com a gestão** no chamado. | `agenda.html`, `agenda_ajuste_20` (rodar antes) |
| 10/10/2026 | Funcionários de empresa terceira deixam de ver LPU e Gestão financeira: a LPU é preenchida pelo administrador da empresa na nova tela **Minha equipe** (o que cada funcionário está fazendo, LPUs para preencher, em campo, agendadas e concluídas), com aviso "LPU para preencher" no sino e no celular quando o funcionário termina (Implantação e GTD). | `agenda.html`, `agenda_ajuste_19` (rodar antes) |
| 10/10/2026 | Coordenada do cliente no cadastro do projeto, usada como destino da rota no celular do técnico; contato e telefone obrigatórios só no lançamento interno e na ativação; nova topologia **FWA** (detectada por "FWA"/"FWA 5G", só ativação, sem cabo, caixas, rua, interno e extensão). | `agenda.html` |
| 10/10/2026 | Painel de KPIs: Rede executada passa a usar só as LPUs (cabo lançado pela LPU); Visão geral com atividades agendadas; Simulação de entrega removida. GTD: botão Chat no cartão do Kanban e na lista do técnico; Visão geral sem Por OLT e CLT x terceiros, com novo layout de categoria, desfecho, cidade e técnico. Sino com só os avisos não lidos. | `agenda.html` |
| 09/10/2026 | Relatório de entrega: botão **Enviar o PDF salvo no celular** quando o PDF gerado não chega à agenda, e mensagens com o motivo do erro. | `agenda.html` |
| 09/10/2026 | Relatórios e LPU pendentes deixam de travar o início da próxima atividade; a atividade nova mostra as pendências de envio. Só trava quem está em campo (deslocamento, no local ou em execução). | `agenda.html` |
| 08/10/2026 | Organização no plano Pro do Supabase: tela de espaço de armazenamento passa a medir contra 100 GB de arquivos e 8 GB de banco. | `armazenamento.html` |
| 08/10/2026 | Script para apagar os testes do GTD Manutenção de técnicos escolhidos. | `gtd_limpar_testes_por_tecnico.sql` |
| 08/10/2026 | Base de previsão sem a coluna Status e com layout novo (cabeçalho agrupado, etiqueta fixa, total de dias, cadastro compacto, filtro de cadastro incompleto); Previsão dos projetos com coluna Projeto, cartões coloridos por situação da fase, entrega destacada, legenda e filtros. | `agenda.html` |
| 08/10/2026 | Backlog de projetos refeito: só projetos não entregues, colunas Lançamento externo, Lançamento interno e Ativação (com a situação das fases anteriores), e quantidade de trabalho nos cards (cabo a lançar, caixas de extensão, previsão de dias por fase) e no topo. | `agenda.html` |
| 08/10/2026 | Implantação: ativação sem trava (aviso das fases que faltam no agendamento e na conclusão, com registro de "finalizada sem"); outras atividades agendáveis (vistoria de lançamento, validação de link, entrega de equipamento, integração); projeto sem lançamento na rua no cadastro; terminador e extensão óptica nos materiais do lançamento interno. | `agenda.html`, `agenda-lembretes.ts` |
| 08/10/2026 | Script para apagar os testes de técnicos escolhidos (atividades e LPUs da Implantação) antes de liberar a ferramenta para as equipes de lançamento. | `agenda_limpar_testes_por_tecnico.sql` |
| 08/10/2026 | GTD Manutenção: seção **Tempos de atendimento** no Painel de KPIs do GTD, igual à da Implantação, com deslocamento, espera no cliente, atendimento, validação do NOC e RFO por chamado, filtros de categoria, técnico e cliente, agrupamento por técnico, cliente e categoria, expurgo por etapa (tabela `ag_expurgos_gtd`) e planilha. | `agenda.html`, `agenda_ajuste_18` |
| 08/10/2026 | Painel do dia com filtro por fase. Painel de KPIs com a seção **Tempos de atendimento**: deslocamento, espera no cliente e atividade por atividade (padrão: Ativação), pesquisa por cliente e técnico, totais, alertas de registros fora do padrão, expurgo por etapa com motivo e planilha. Tempo de relatório: o app passa a gravar o horário em que o técnico envia os relatórios (também mostrado na linha do tempo da atividade como "Relatórios enviados"). | `agenda.html`, `agenda_ajuste_18` |
| 08/10/2026 | Ativação bloqueada quando as fases anteriores foram feitas por outro técnico: o celular de quem ia ativar só conhecia as próprias atividades e mostrava "A ativação só pode ser finalizada depois de: rua, interno", embora a gestão visse as fases finalizadas. O app do técnico passa a consultar as fases finalizadas por outros técnicos no mesmo projeto (com o nome de quem finalizou). Caso de origem: etiqueta 5Q2QBSYX, rua e interno finalizados por RHIKELMY SOARES MACEDO. | `agenda.html`, `agenda_ajuste_17` |
| 08/10/2026 | Salvamento das atividades: quando o banco não aplica uma alteração do técnico (login expirado no navegador ou sem permissão), o app agora tenta renovar o login e gravar de novo; se não conseguir, avisa "o banco não aceitou a alteração… saia e entre de novo" em vez de seguir como se tivesse salvo. A gestão passa a recarregar o Painel do dia, a Agenda, o Painel e os Relatórios a cada 2 minutos, como reserva do tempo real. | `agenda.html` |
| 08/10/2026 | Correção do envio da LPU (Implantação): a LPU passa a ser gravada direto no banco e a atividade só é encerrada depois que o banco confirma. Se a internet cair ou o app fechar, aparece "A LPU NÃO foi enviada" e o técnico toca em Enviar LPU de novo. Atividade concluída sem LPU no sistema mostra o aviso e o botão **Enviar a LPU**; atividade com a LPU já gravada e não encerrada mostra **Encerrar a atividade** (evita LPU em dobro). Caso de origem: LPU do terceiro na etiqueta 2TDWFQ5A, com a atividade concluída e a LPU ausente no banco. | `agenda.html` |
| 07/10/2026 | GTD Manutenção, 3ª rodada: aceite ou recusa do despacho pelo técnico (recusa com motivo volta o chamado para Não despachados e avisa a gestão; marcas Aguardando aceite, Aceito e Recusado no Kanban); fotos no RFO com carimbo e Relatório do atendimento em PDF; cartão do Kanban redesenhado (categoria com cor e contador de mensagens compacto). | `agenda.html`, `agenda_ajuste_16` |
| 07/10/2026 | GTD Manutenção, 2ª rodada: Financeiro dentro do Painel de KPIs (Budget e consumo da conta Manutenção cliente com definição do budget, Detalhamento das LPUs com itens mais usados e Aprovação de LPU), como na Implantação; técnico com Hoje, Próximas e Encerradas também nos chamados; relatórios do GTD em lista por cliente; chat atualiza na hora com a conversa aberta (correção), Enter envia e Shift + Enter pula linha no computador, botões Câmera e Galeria; selo de mensagem nova do técnico no Painel do dia e no Kanban, que some quando alguém abre a conversa. | `agenda.html`, `agenda_ajuste_15` |
| 07/10/2026 | **GTD Manutenção em produção** e novo nome do programa: **Ferramenta de Gestão O&M**. Categorias Implantação e GTD Manutenção; papéis NOC (cria, acompanha e valida chamados, não despacha) e Delivery (só Implantação, telas liberadas pela coordenação, nunca vê o GTD); criar chamado colando o texto do NOC; Kanban, agenda, despacho, validação só pelo NOC (e por quem tem Acesso NOC), MTTR e SLA, RFO no formato do WhatsApp, LPU com conta fixa de Manutenção cliente (CLT registrada sem aprovação; terceiro com aprovação no mesmo layout e budget da conta), relatórios por cliente e painel de KPIs. Mensagens com foto e sino de avisos nas duas categorias, com push. Implantação conferida tela a tela com a versão anterior (mesmo conteúdo, só com o botão Mensagens) e mesmas gravações no banco. | `agenda.html`, `sw.js`, `manifest.webmanifest`, `index.html`, `agenda-lembretes.ts` (deploy), `agenda_ajuste_14` |
| 07/10/2026 | Retenção automática de 30 dias nos buckets `agendamento-fotos` e `preventivas-pdfs` do **projeto de preventivas e agendamentos** (outro projeto da mesma organização, que divide a cota de 1 GB): todo dia às 03:07 os arquivos com mais de 30 dias são apagados; prazo configurável por bucket. A tela Espaço de armazenamento passa a tratar só o bucket da agenda e avisa que a cota é da organização. | `armazenamento.html`, `agenda_ajuste_13` (só bucket `agenda`); no outro projeto: `preventivas_retencao_arquivos.sql` e Edge Function `limpeza-arquivos` (deploy, JWT desligado, segredo `CRON_SECRET` próprio) |
| 06/10/2026 | Cota do plano gratuito do Supabase: fotos novas menores (agenda 1280 px e JPEG 60%, antes 1600 px e 72%; relatório de entrega JPEG 62%, antes 82%) e nova tela **Espaço de armazenamento** para o coordenador ver o uso, compactar as fotos já enviadas sem mudar os links e apagar pastas do bucket antigo `agendamento-fotos`. | `agenda.html`, `relatorio-ativacao.html`, novo `armazenamento.html`, `agenda_ajuste_13` |
| 06/10/2026 | Funcionários de empresas terceiras: novo acesso "Funcionário de empresa terceira" ligado ao administrador da empresa. O funcionário faz a LPU normalmente, sem gestão financeira; a LPU vai para a aba "Para conferir" do administrador, que corrige se precisar e envia ao O&M. A aprovação mostra quem conferiu e quem executou. Avisos para o administrador. | `agenda.html`, `agenda-lembretes.ts` (deploy), `agenda_ajuste_12` |
| 06/10/2026 | Início da operação: dados de teste apagados (atividades, LPUs e avisos), mantendo projetos, complementos, anexos, budget, usuários e estoque; arquivos de teste removidos do Storage. | `agenda_zerar_dados_de_teste.sql` |
| 06/10/2026 | Volta da previsão de chegada informada pelo técnico ao iniciar o deslocamento (o cálculo automático pela localização foi retirado por demora e erros de destino). O Painel do dia mantém o aviso "Chegando em cerca de 5 minutos" pela previsão informada, e o carimbo das fotos continua igual. Campo de coordenadas do cliente retirado dos dados complementares. | `agenda.html` |
| 06/10/2026 | Previsão de chegada mais rápida e precisa: uma chamada só para destino e rota, localização rápida antes da precisa, busca do endereço com cidade e UF e adiantada ao abrir a atividade, aviso "Confira o destino" com link do mapa quando o endereço cai fora da cidade, ajuste de trânsito aprendido com as chegadas reais e recálculo por deslocamento de 400 m. | `agenda.html`, `agenda-rota.ts` (deploy) |
| 06/10/2026 | PDF da LPU com a aprovação eletrônica (nome de quem aprovou, data e hora): gerado e guardado no momento da aprovação, mantendo o PDF original do envio; LPUs aprovadas antes disso geram a versão com o aprovador ao abrir. Botão "Abrir PDF da LPU" na atividade do técnico e correção da abertura do PDF no celular (o navegador bloqueava a janela). | `agenda.html` |
| 06/10/2026 | Notificação ao técnico quando a LPU é aprovada, reprovada ou devolvida para ajuste (com quem decidiu e o motivo); tocar na notificação abre a atividade. | `agenda-lembretes.ts` (deploy), `agenda_ajuste_11` |
| 06/10/2026 | LPU do técnico: correção da busca e do filtro por classe no celular (os itens filtrados continuavam visíveis), descritivo técnico volta a abrir só no "o que é?", observação para a gestão sem texto de exemplo. LPU aprovada mostra "Aprovada por [nome] em [data e hora]" para a gestão e para o técnico. | `agenda.html` |
| 06/10/2026 | Previsão de chegada calculada automaticamente pela localização do técnico (sem digitar o horário), aviso "Chegando em cerca de 5 minutos" no Painel do dia, coordenadas opcionais do cliente nos dados complementares e carimbo de horário, data, endereço, coordenadas e código nas fotos (agenda e relatório de entrega). | `agenda.html`, `relatorio-ativacao.html`, nova Edge Function `agenda-rota` (deploy) e segredo `ORS_API_KEY` |
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
