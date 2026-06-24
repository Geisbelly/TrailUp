export type Region = {
  id: string
  name: string
  polygon: { x: number; y: number }[]
  labelPos: { x: number; y: number }
}

export const REGIONS: Region[] = [
  {
    id: 'r1',
    name: 'Norte',
    polygon: [
      { x: 40, y: 280 }, { x: 180, y: 210 }, { x: 260, y: 260 },
      { x: 230, y: 340 }, { x: 120, y: 360 }, { x: 60, y: 320 }
    ],
    labelPos: { x: 150, y: 300 },
  },
  {
    id: 'r2',
    name: 'Nordeste',
    polygon: [
      { x: 280, y: 230 }, { x: 380, y: 220 }, { x: 440, y: 260 },
      { x: 420, y: 330 }, { x: 320, y: 350 }, { x: 260, y: 300 }
    ],
    labelPos: { x: 340, y: 300 },
  },
  {
    id: 'r3',
    name: 'Centro',
    polygon: [
      { x: 190, y: 360 }, { x: 310, y: 360 }, { x: 360, y: 420 },
      { x: 290, y: 470 }, { x: 200, y: 450 }, { x: 160, y: 400 }
    ],
    labelPos: { x: 260, y: 420 },
  },
  {
    id: 'r4',
    name: 'Sudeste',
    polygon: [
      { x: 360, y: 420 }, { x: 430, y: 420 }, { x: 480, y: 470 },
      { x: 430, y: 520 }, { x: 340, y: 510 }, { x: 300, y: 470 }
    ],
    labelPos: { x: 410, y: 485 },
  },
  {
    id: 'r5',
    name: 'Sul',
    polygon: [
      { x: 280, y: 520 }, { x: 360, y: 530 }, { x: 390, y: 600 },
      { x: 320, y: 640 }, { x: 240, y: 610 }, { x: 230, y: 550 }
    ],
    labelPos: { x: 320, y: 590 },
  },
  {
    id: 'r6',
    name: 'Leste',
    polygon: [
      { x: 460, y: 260 }, { x: 520, y: 250 }, { x: 560, y: 300 },
      { x: 560, y: 360 }, { x: 500, y: 360 }, { x: 440, y: 330 }
    ],
    labelPos: { x: 520, y: 320 },
  },
]
