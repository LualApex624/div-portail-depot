import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/**
 * Contexte de requete propage sans passer l'objet Request de couche en couche.
 * Utilise uniquement pour la correlation des logs.
 */
export const RequestContext = {
  run<T>(store: RequestStore, callback: () => T): T {
    return storage.run(store, callback);
  },
  current(): RequestStore | undefined {
    return storage.getStore();
  },
};
