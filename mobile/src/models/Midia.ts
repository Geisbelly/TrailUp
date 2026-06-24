export class Midia {
  constructor(
    public id: number,
    public tipo: string | null,
    public url: string | null,
    public legenda: string | null,
    public ordem: number | null
  ) {}
}