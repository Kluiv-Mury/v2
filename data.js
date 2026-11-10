// Conteúdo do portfólio v5. A informação é a mesma do site no ar (kluiv-mury.github.io); a organização é nova.
window.KM = {
  profile: {
    name: "Kluivert Mury",
    role: "Desenvolvedor Python · backend e dados",
    base: "São Gonçalo, RJ",
    email: "kluivert.mury@gmail.com",
    linkedin: "https://www.linkedin.com/in/kluivertmury",
    github: "https://github.com/Kluiv-Mury",
    cv: "cv.pdf",
  },
  facts: [
    ["Base", "São Gonçalo, RJ"],
    ["Formação", "Sistemas de Informação na UFF"],
    ["Agora", "Escritório de Dados da Prefeitura de Niterói"],
    ["Foco", "Backend, dados e IA"],
  ],
  stats: [
    [149, "testes automatizados no pipeline de CI"],
    [2, "plataformas públicas de Niterói com dados integrados"],
    [3, "projetos pessoais desenvolvidos de ponta a ponta"],
  ],

  // as camadas do Gêmeo Digital, de baixo para cima
  layers: [
    { name: "Edificações 3D", source: "SMU · modelo mapeado com LiDAR" },
    { name: "Pluviômetros", source: "Defesa Civil · leituras a cada 15 min" },
    { name: "Câmeras urbanas", source: "NitTrans · último minuto de vídeo" },
    { name: "Ônibus", source: "MobNit/SEMOBI · posição a cada 30 s" },
    { name: "Trânsito", source: "Waze for Cities · a cada 2 min", mine: "Integração dos alertas e do fluxo viário às camadas do Gêmeo." },
    { name: "NitBike", source: "Disponibilidade por estação · a cada 1 min", mine: "Disponibilidade das estações integrada, com dados derivados por cálculo: as viagens e as estações mais quentes e mais frias." },
  ],
  colab: {
    pitch: "Canal oficial em que os moradores registram pedidos à prefeitura, como iluminação e coleta de entulho. Integrado ao SIGeo, cada solicitação vira um ponto no mapa com categoria, bairro e status de atendimento.",
    url: "https://experience.arcgis.com/experience/8b3c6160914d46e8a25017b5d7b210d0",
    kpis: [["154 mil", "solicitações registradas"], ["87%", "resolvidas"], ["13%", "em aberto"]],
    series: [[2013, 1], [2014, 967], [2015, 3900], [2016, 3500], [2017, 2600], [2018, 4200], [2019, 7300], [2020, 8300], [2021, 15200], [2022, 17900], [2023, 20200], [2024, 20200], [2025, 27400], [2026, 23200]],
    source: "Painel público SIGeo/COLAB, outubro de 2026. 2026 é parcial.",
    mine: ["Integro as solicitações ao SIGeo, ligando cada pedido ao bairro, à categoria e ao status de atendimento.", "Construo camadas de pontos e de mapa de calor que mostram onde as demandas se concentram.", "Monto indicadores de pedidos abertos e resolvidos por ano, mês, dia e hora."],
  },
  poc: {
    pitch: "Prova de conceito para antecipar o agravamento do trânsito em Niterói. A partir do histórico do Waze, um modelo estima a chance de a situação piorar em cada local e horário, para o painel de trânsito receber alertas antes dos congestionamentos críticos.",
    steps: ["Base histórica do Waze (TVT)", "Análise exploratória", "Modelo preditivo", "Validação"],
  },

  // experiência: o quadro de partidas e as linhas de cada frente
  departures: [
    { when: "FEV 2026", to: "PREFEITURA DE NITERÓI", what: "ESTÁGIO · ENG. DE DADOS", status: "EM CURSO" },
    { when: "JUL 2025", to: "UFF", what: "INICIAÇÃO CIENTÍFICA", status: "CONCLUÍDO" },
    { when: "2023", to: "UFF", what: "SISTEMAS DE INFORMAÇÃO", status: "EM CURSO" },
  ],
  lines: [
    { n: "L01", where: "Prefeitura", title: "Agentes de IA e servidores MCP", text: "Desenvolvo servidores MCP e agentes de IA em Python para automatizar tarefas repetitivas do time de dados.", tech: ["Python", "Servidores MCP", "Agentes de IA"] },
    { n: "L02", where: "Prefeitura", title: "Integrações com APIs", text: "Escrevo integrações com APIs de sistemas internos e externos.", tech: ["Python", "APIs REST"] },
    { n: "L03", where: "Prefeitura", title: "Automação com n8n, Azure e Fabric", text: "Os pedidos de criação e de acesso a workspaces de dados chegam pelo sistema de chamados e seguem sozinhos pela aprovação do responsável, pela criação dos grupos de acesso no Entra ID, pelo provisionamento e pelos avisos por e-mail e Teams.", tech: ["n8n", "Azure", "Microsoft Fabric"] },
    { n: "L04", where: "Prefeitura", title: "Agente no Microsoft Foundry", text: "Um agente que responde em linguagem natural consultando o modelo semântico de trânsito.", tech: ["Microsoft Foundry", "Agentes de IA"] },
    { n: "L05", where: "Prefeitura", title: "Pipelines no Microsoft Fabric", text: "Pipelines que levam os dados das subsecretarias até os painéis de BI: Lakehouse, transformações, modelo semântico e Power BI.", tech: ["Microsoft Fabric", "SQL"] },
    { n: "L06", where: "Prefeitura", title: "Gêmeo Digital · NitBike", text: "Construo camadas no ArcGIS que alimentam o Gêmeo e derivo por cálculo o que o feed não traz, como as próprias viagens e as estações mais quentes e mais frias.", tech: ["Python", "ArcGIS", "SQL"] },
    { n: "L07", where: "Prefeitura", title: "Colab · solicitações", text: "Integração de dados e camadas de visualização do painel de solicitações (SIGeo).", tech: ["Python", "SQL", "ArcGIS"] },
    { n: "L08", where: "UFF", title: "Data Lake em Docker", text: "Pipeline com Data Lake em MinIO, carga em MySQL e ClickHouse e ambiente todo em Docker.", tech: ["MinIO", "MySQL", "ClickHouse", "Docker"] },
    { n: "L09", where: "UFF", title: "Dados hospitalares com o SUS", text: "Hospedei no Data Lake dados hospitalares de uma parceria com o SUS.", tech: ["Python", "MinIO"] },
  ],

  projects: [
    {
      id: "concurso", title: "Bot de concursos públicos", kicker: "Telegram · AWS",
      summary: "Coleta concursos abertos no Brasil e avisa cada usuário conforme os filtros dele: estado, salário, nível e palavra-chave.",
      bullets: ["O scraping roda numa thread separada para não travar o bot.", "PostgreSQL com migração de esquema e backup diário.", "149 testes com pytest no GitHub Actions e serviço systemd no Linux."],
      tech: ["Python", "python-telegram-bot", "PostgreSQL", "pytest", "GitHub Actions", "Linux"],
      repo: "https://github.com/Kluiv-Mury/concurso-notifier",
    },
    {
      id: "saude", title: "Painel de saúde no Brasil", kicker: "FastAPI · mapa por estado",
      summary: "API em FastAPI que serve um mapa interativo com a quantidade de profissionais e estabelecimentos de saúde por estado.",
      bullets: ["Dados públicos tratados com Pandas.", "Mapa interativo em Plotly servido pela própria API.", "Publicado em servidor próprio."],
      tech: ["Python", "FastAPI", "Pandas", "Plotly"],
      repo: null,
    },
    {
      id: "mocforge", title: "MocForge MCP", kicker: "Claude + LeoCAD",
      summary: "Servidor MCP que deixa o Claude montar modelos de LEGO no LeoCAD a partir de pedidos em texto.",
      bullets: ["Edita o arquivo do modelo peça por peça.", "Gera imagens para conferir o resultado."],
      tech: ["Python", "FastMCP"],
      repo: "https://github.com/Kluiv-Mury/mocforge-mcp",
    },
  ],

  // onde cada ferramenta foi usada (trabalhos à esquerda do grafo)
  works: [
    { id: "pref", label: "Estágio na Prefeitura", tech: ["Python", "SQL", "Microsoft Fabric", "Microsoft Foundry", "n8n", "Azure", "Git", "Servidores MCP", "Agentes de IA", "APIs REST"] },
    { id: "gemeo", label: "Gêmeo Digital", tech: ["Python", "ArcGIS", "SQL", "APIs REST"] },
    { id: "colab", label: "Colab", tech: ["Python", "SQL", "ArcGIS"] },
    { id: "ic", label: "Iniciação Científica", tech: ["Python", "MinIO", "MySQL", "ClickHouse", "Docker"] },
    { id: "concurso", label: "Bot de concursos", tech: ["Python", "PostgreSQL", "pytest", "GitHub Actions", "Linux"] },
    { id: "saude", label: "Painel de saúde", tech: ["Python", "FastAPI", "Pandas"] },
    { id: "mocforge", label: "MocForge MCP", tech: ["Python", "Servidores MCP"] },
  ],
};

// Retrato das estações (número, nome, longitude, latitude, capacidade), para quando a camada pública não responder.
window.KM.stations = [[1, "Praça Arariboia I", -43.12409, -22.89415, 35], [2, "Praça Arariboia II", -43.12399, -22.89406, 28], [3, "Ponto Cem Réis", -43.10893, -22.88191, 16], [4, "Terminal João Goulart", -43.12441, -22.89152, 35], [5, "Praça São João", -43.12214, -22.89123, 12], [6, "Prefeitura", -43.11824, -22.89274, 20], [7, "Palácio Araribóia", -43.12165, -22.89447, 20], [8, "Praça do Rink", -43.12164, -22.89551, 16], [9, "Theatro Municipal", -43.12385, -22.89609, 24], [10, "Valonguinho", -43.12587, -22.89643, 21], [11, "IEPIC", -43.12694, -22.89866, 12], [12, "Nilo Peçanha", -43.12391, -22.90167, 20], [13, "Praia das Flechas", -43.12251, -22.90497, 28], [14, "Presidente Pedreira", -43.12615, -22.9035, 20], [15, "Praça da Cantareira", -43.13096, -22.89917, 35], [16, "Praia Vermelha", -43.13003, -22.90378, 24], [17, "Praça da Bicicleta", -43.13224, -22.901, 20], [18, "Marechal Deodoro", -43.11722, -22.88937, 16], [19, "Rodoviaria Roberto Silveira", -43.12128, -22.88496, 16], [20, "Visconde do Uruguai", -43.12277, -22.88825, 12], [21, "Mercado de Peixe", -43.12519, -22.88571, 14], [22, "Praça Oirthon Dantas", -43.12517, -22.88237, 20], [23, "Benjamin Constant", -43.1089, -22.8775, 16], [24, "Praça Nereu Guerra", -43.10475, -22.87208, 21], [25, "General Castrioto", -43.10432, -22.86865, 21], [26, "João Brasil", -43.10111, -22.87934, 16], [27, "Policlínica da Engenhoca", -43.0946, -22.87277, 16], [28, "Marquês do Paraná", -43.11296, -22.89549, 21], [29, "Praça José Bedran", -43.11203, -22.9, 14], [30, "Paulo César", -43.10692, -22.89903, 16], [31, "Reitoria da UFF", -43.11733, -22.904, 35], [32, "Mem de Sá", -43.11019, -22.90201, 12], [33, "Paulo Gustavo", -43.11276, -22.90487, 12], [34, "Alameda São Boaventura", -43.10477, -22.88058, 12], [35, "Otávio Carneiro", -43.11103, -22.90764, 16], [36, "Mariz e Barros", -43.10833, -22.90956, 12], [38, "Lemos Cunha", -43.10645, -22.90547, 12], [39, "Miguel Couto", -43.1055, -22.90266, 12], [40, "Santa Rosa", -43.10193, -22.89987, 16], [41, "Mercado Municipal", -43.11359, -22.88349, 16], [42, "Nóbrega", -43.10239, -22.90437, 20], [43, "Praça Guadalajara", -43.09599, -22.87954, 16], [44, "Sete de Setembro", -43.09952, -22.90337, 20], [45, "Otávio Kelly", -43.09994, -22.9077, 12], [46, "Policlínica Sérgio Arouca", -43.09781, -22.90525, 16], [47, "Presidente Craveiro Lopes", -43.10029, -22.86476, 16], [48, "Flávio Palmier", -43.09555, -22.86227, 21], [49, "Engenhoca", -43.09527, -22.86982, 16], [50, "Ilha da Conceição", -43.11585, -22.86775, 16], [51, "Quintino Bocaiúva", -43.09523, -22.91507, 21], [52, "Tapuias", -43.09411, -22.9193, 14], [53, "Rui Barbosa", -43.09172, -22.9206, 16], [54, "Silvio Picanço", -43.09458, -22.92433, 14], [55, "Charitas", -43.09854, -22.93223, 35], [56, "Praça da Cantareira II", -43.13112, -22.89894, 28], [57, "Pé Pequeno", -43.10199, -22.8973, 16], [62, "Francisco da Cruz Nunes", -43.05667, -22.9417, 16], [67, "Rotatória de Camboinhas", -43.05752, -22.94949, 21], [69, "Praia de Piratininga II", -43.08501, -22.95434, 21], [101, "Campo de São Bento", -43.10801, -22.9054, 16], [102, "Caminho Niemeyer", -43.12728, -22.89046, 16], [103, "Boa Viagem", -43.1303, -22.90827, 20], [104, "Horto do Fonseca", -43.09054, -22.88132, 20], [105, "Praia de Icaraí", -43.11248, -22.90718, 16], [106, "Parque Orla de Piratininga", -43.07284, -22.93773, 20]];
