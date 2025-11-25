export interface BoardMetadata {
  id: string;
  ownerId: string;
  title: string;
  isShared: boolean;
  permission: 'view' | 'edit';
  createdAt: string;
  updatedAt: string;
}

export interface BoardSnapshot {
  id: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files?: Record<string, unknown>;
  capturedAt: string;
}
