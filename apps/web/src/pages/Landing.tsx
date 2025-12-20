import { Link } from '@tanstack/react-router';
import { env } from '../lib/env';

export function Landing() {
  const discordUrl = env.discordUrl || 'https://discord.com';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:py-14">
      <main className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6 sm:p-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Un whiteboard avec une IA qui t’aide quand tu bloques sur un exercice
          </h1>
          <p className="mt-3 text-base text-gray-700">
            Tu écris ton raisonnement. L’IA lit ce que tu fais et t’aide à avancer sans donner la réponse.
          </p>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900">Description courte</h2>
            <p className="mt-3 text-gray-700">
              L’idée: travailler comme sur une feuille, mais avec une IA qui suit ton raisonnement et te relance quand tu bloques.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900">Ce que fait l’outil</h2>
            <ol className="mt-3 list-decimal pl-5 text-gray-700 space-y-2">
              <li>Tu fais ton exercice sur un whiteboard.</li>
              <li>L’IA analyse ce que tu écris.</li>
              <li>Elle te pose des questions et te guide quand tu bloques.</li>
            </ol>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900">À qui c’est utile</h2>
            <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-2">
              <li>Collège / lycée / fac</li>
              <li>Maths, physique, info (pour l’instant)</li>
              <li>Quand tu comprends le cours mais que tu bloques sur les exos</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900">Tester</h2>
            <p className="mt-3 text-gray-700">
              L’outil est en prototype. On cherche des retours d’étudiants.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <Link
                to="/app"
                className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Tester l’outil
              </Link>
              <a
                href={discordUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 border border-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
              >
                Rejoindre le Discord
              </a>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Accès au board via connexion (redirigé si nécessaire).
            </p>
          </section>

          <footer className="mt-10 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Ce projet est en test. Les retours négatifs sont aussi utiles que les positifs.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
