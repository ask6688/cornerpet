type PetStateSnapshot = ReturnType<ReturnType<typeof import('../shared/pet-state.mjs').createPetStateMachine>['getSnapshot']>;
export {};
declare global {
  interface Window {
    cornerpet: {
      getState(): Promise<PetStateSnapshot>;
      interact(): Promise<PetStateSnapshot>;
      onState(callback: (state: PetStateSnapshot) => void): () => void;
      getConfig(): Promise<typeof import('../shared/pet-config.mjs').PET>;
      setScale(scale: number): Promise<number>;
      resizeBegin(source?: 'pinch' | 'panel'): Promise<{ scale: number; anchor: { x: number; y: number; ax: number }; footprint: { x: number; y: number; width: number; height: number }; limits: { min: number; max: number }; frame: { x: number; y: number; width: number; height: number } } | null>;
      resizeExpand(): void;
      resizeTakeover(): void;
      resizeResult(result: { id?: number; scale?: number; error?: string }): void;
      onResizeRequest(callback: (request: { id?: number; scale?: number; commit?: boolean; cancel?: boolean }) => void): () => void;
      resizeCommit(scale: number): Promise<{ scale: number; view: { scale: number; offset: { x: number; y: number }; viewport: { x: number; y: number; width: number; height: number } } }>;
      resizeCancel(): Promise<{ scale: number; view: { scale: number; offset: { x: number; y: number }; viewport: { x: number; y: number; width: number; height: number } } }>;
      focusPet(): void;
      onResizeHint(callback: () => void): () => void;
      previewScale(scale: number): Promise<number>;
      getScaleOptions(): Promise<{ scale: number; min: number; max: number }>;
      closeScale(): void;
      getView(): Promise<{ scale: number; offset: { x: number; y: number }; viewport: { x: number; y: number; width: number; height: number } }>;
      setFootprint(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
      onView(callback: (view: { scale: number; offset: { x: number; y: number }; viewport: { x: number; y: number; width: number; height: number } }) => void): () => void;
      startDrag(): Promise<void>;
      endDrag(): Promise<boolean>;
      menu(): void;
      quit(): void;
    };
  }
}
