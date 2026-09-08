import { redirect } from 'next/navigation';

/** La racine n'a pas d'ecran propre : l'avocat entre par son espace. */
export default function HomePage() {
  redirect('/avocat/login');
}
