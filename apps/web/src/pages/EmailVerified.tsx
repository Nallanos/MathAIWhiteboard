import { Link, useSearch } from '@tanstack/react-router';

export function EmailVerified() {
  const search = useSearch({ from: '/email-verified' }) as { success?: string; error?: string };
  const isSuccess = search.success === 'true';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
          {isSuccess ? (
            <>
              <div className="flex justify-center mb-6">
                <div className="bg-green-100 rounded-full p-3">
                  <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Email vérifié !</h1>
              <p className="text-gray-600 mb-8">
                Merci d'avoir vérifié votre adresse email. Votre compte est maintenant pleinement activé.
              </p>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="bg-red-100 rounded-full p-3">
                  <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Oups !</h1>
              <p className="text-gray-600 mb-8">
                {search.error === 'expired' 
                  ? "Le lien de vérification a expiré." 
                  : "Nous n'avons pas pu vérifier votre email. Le lien est peut-être invalide ou a déjà été utilisé."}
              </p>
            </>
          )}

          <Link
            to="/app"
            className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
