declare global {
  export interface SymbolConstructor {
    readonly observable: symbol;
  }
}

export interface Symbol {
  readonly [Symbol.observable]: symbol;
}
