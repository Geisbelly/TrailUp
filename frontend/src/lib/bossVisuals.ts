export const bossVisuals = [
  {
    "id": "boss-01",
    "label": "Dragão rubro"
  },
  {
    "id": "boss-02",
    "label": "Dragão azul"
  },
  {
    "id": "boss-03",
    "label": "Espectro arcano"
  },
  {
    "id": "boss-04",
    "label": "Guardião das runas"
  },
  {
    "id": "boss-05",
    "label": "Sentinela solar"
  },
  {
    "id": "boss-06",
    "label": "Fênix de fogo"
  },
  {
    "id": "boss-07",
    "label": "Guerreira das chamas"
  },
  {
    "id": "boss-08",
    "label": "Arqueira do gelo"
  },
  {
    "id": "boss-09",
    "label": "Mago astral"
  },
  {
    "id": "boss-10",
    "label": "Exploradora arcana"
  },
  {
    "id": "boss-11",
    "label": "Cavaleiro solar"
  },
  {
    "id": "boss-12",
    "label": "Invocador das chamas"
  },
  {
    "id": "boss-13",
    "label": "Cristal celeste"
  },
  {
    "id": "boss-14",
    "label": "Cristal real"
  },
  {
    "id": "boss-15",
    "label": "Cristal arcano"
  },
  {
    "id": "boss-16",
    "label": "Cristal solar"
  },
  {
    "id": "boss-17",
    "label": "Cristal de magma"
  },
  {
    "id": "boss-18",
    "label": "Cristal esmeralda"
  },
  {
    "id": "boss-19",
    "label": "Cristal de gelo"
  },
  {
    "id": "boss-20",
    "label": "Cristal violeta"
  },
  {
    "id": "boss-21",
    "label": "Núcleo de fogo"
  },
  {
    "id": "boss-22",
    "label": "Núcleo sombrio"
  },
  {
    "id": "boss-23",
    "label": "Golem glacial I"
  },
  {
    "id": "boss-24",
    "label": "Golem glacial II"
  },
  {
    "id": "boss-25",
    "label": "Golem glacial III"
  },
  {
    "id": "boss-26",
    "label": "Golem glacial IV"
  },
  {
    "id": "boss-27",
    "label": "Golem glacial V"
  },
  {
    "id": "boss-28",
    "label": "Espectro abissal"
  },
  {
    "id": "boss-29",
    "label": "Lorde necromante"
  },
  {
    "id": "boss-30",
    "label": "Titã das chamas"
  },
  {
    "id": "boss-31",
    "label": "Monarca das sombras"
  }
] as const;

export function normalizeBossVisual(value: unknown): string | null {
  return typeof value === "string" && bossVisuals.some((item) => item.id === value) ? value : null;
}
