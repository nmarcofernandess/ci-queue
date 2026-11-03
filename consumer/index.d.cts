export type Executor = 'direct' | 'queue'
export declare const CONSUMER_API_VERSION: 1
export declare function selectExecutor(input?: { explicit?: Executor; environment?: string; configured?: Executor; fallback?: Executor }): Executor
export declare function appendRecipeArgs(argv: readonly string[], extraArgs: readonly string[]): string[]
