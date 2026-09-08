/** Formatages partages. Regroupes ici pour rester coherents d'un ecran a l'autre. */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) {
    return `${Math.round(bytes / 1024)} Ko`;
  }
  // Pas de decimale inutile : "25 Mo" et non "25,0 Mo".
  const rounded = Number.isInteger(megabytes) ? String(megabytes) : megabytes.toFixed(1);
  return `${rounded.replace('.', ',')} Mo`;
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** "expire dans 4 jours" / "expire dans 3 heures" / "expiree". */
export function formatRemaining(expiresAt: string | Date): string {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();

  if (remainingMs <= 0) {
    return 'expiree';
  }

  const hours = Math.floor(remainingMs / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `expire dans ${days} jour${days > 1 ? 's' : ''}`;
  }
  if (hours >= 1) {
    return `expire dans ${hours} heure${hours > 1 ? 's' : ''}`;
  }
  const minutes = Math.max(1, Math.floor(remainingMs / 60_000));
  return `expire dans ${minutes} minute${minutes > 1 ? 's' : ''}`;
}

/** "PDF, JPG ou PNG" — enumeration francaise, avec "ou" avant le dernier. */
export function formatFormatList(mimeTypes: string[]): string {
  const labels = mimeTypes.map(shortMimeLabel);
  if (labels.length <= 1) {
    return labels.join('');
  }
  return `${labels.slice(0, -1).join(', ')} ou ${labels[labels.length - 1]}`;
}

export function shortMimeLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    'application/pdf': 'PDF',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
  };
  return labels[mimeType] ?? mimeType.split('/').pop()?.toUpperCase() ?? 'FICHIER';
}
