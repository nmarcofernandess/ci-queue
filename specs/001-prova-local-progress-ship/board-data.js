// Task board da sprint ativa — projeção de implementation_plan.json.
// board.html nunca é editado nesta pasta.

const BOARD = {
  spec: "001-prova-local-progress-ship",
  sprint: "S1/S2 — Recode 11 + progresso visível",
  updated: "2026-09-18 22:10",
  next: "Execute: ratchet positivo no worktree dietflow-ci-queue-node-pin",
  tasks: [
    {
      name: "Ratchet positivo",
      delivers: "Jest deixa de proibir o 13º flag; runtime-probe continua fora",
      state: "queued",
    },
    {
      name: "Predicado ship-bound",
      delivers: "Helper sem receita não vira smoketest; flags do ticket batem com a receita",
      state: "queued",
    },
    {
      name: "Ship Recode 11 atômico",
      delivers: "Catálogo é a membership; Mac sem fila = LOCAL_RED",
      state: "queued",
    },
    {
      name: "Onze flags",
      delivers: "Goldens/importação declaram progress sem mudar argv",
      state: "queued",
    },
    {
      name: "Dez emissores",
      delivers: "Wrappers emitem roots e fecham running→passed/failed",
      state: "queued",
    },
    {
      name: "Docs DietFlow",
      delivers: "Norma: aviso, não recusa; receita nova declara e emite",
      state: "queued",
    },
    {
      name: "public_job derivado",
      delivers: "Browser vê progressEnabled; flags não saem da máquina",
      state: "queued",
    },
    {
      name: "Alert no drawer",
      delivers: "Receita muda mostra o aviso padrão; job não pinta falha",
      state: "queued",
    },
    {
      name: "Review de código",
      delivers: "R2 com vereditos e correções antes de instalar ou mergear",
      state: "queued",
    },
    {
      name: "HEADs e PRs",
      delivers: "specs/ versionado, árvores limpas, HEAD da prova congelado",
      state: "queued",
    },
    {
      name: "Release ativada",
      delivers: "/build.json da instalação bate com o bundle, um worker",
      state: "queued",
    },
    {
      name: "Vite instalado",
      delivers: "Instrumentado mostra estágios; não declarado mostra o Alert",
      state: "queued",
    },
    {
      name: "Ship DietFlow",
      delivers: "npm run ship na identidade dietflowoficial, HEAD congelado",
      state: "queued",
    },
    {
      name: "Ship CI Queue",
      delivers: "ci-queue ship --no-remote depois do DietFlow; sem cadeia após falha",
      state: "queued",
    },
  ],
};
