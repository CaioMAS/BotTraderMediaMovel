export interface Purchase {
  buyTime: string
  buyPrice: number
  sellTime: string | null
  sellPrice: number | null
  result: number | null
}

export interface Sale {
  buyTime: string
  buyPrice: number
  sellTime: string
  sellPrice: number
  result: number
}

export interface TrailingStopEntry {
  trailingStop: number
  timestamp: string
}
