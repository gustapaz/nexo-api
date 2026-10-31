export const examples = {
  release: {
    title: "Pipeline de publicação",
    request: {
      workers: 2,
      tasks: [
        { id: "assets", label: "Preparar assets", duration: 4 },
        { id: "build", label: "Compilar", duration: 6, depends_on: ["assets"] },
        { id: "tests", label: "Testar", duration: 8 },
        {
          id: "review",
          label: "Revisar",
          duration: 3,
          depends_on: ["build", "tests"],
        },
        {
          id: "deploy",
          label: "Publicar",
          duration: 2,
          depends_on: ["review"],
        },
      ],
    },
  },
  bottleneck: {
    title: "Disputa por trabalhadores",
    request: {
      workers: 2,
      tasks: [
        { id: "a", label: "Trilha A", duration: 7 },
        { id: "b", label: "Trilha B", duration: 5 },
        { id: "c", label: "Trilha C", duration: 4 },
        {
          id: "d",
          label: "Consolidar",
          duration: 3,
          depends_on: ["a", "b", "c"],
        },
      ],
    },
  },
  cycle: {
    title: "Ciclo impossível",
    request: {
      workers: 2,
      tasks: [
        { id: "a", duration: 3, depends_on: ["c"] },
        { id: "b", duration: 4, depends_on: ["a"] },
        { id: "c", duration: 2, depends_on: ["b"] },
      ],
    },
  },
};
