import { useState } from 'react';

import { useAuth } from '../shared/auth';
import { firebaseConfigured } from '../services/firebase';
import { formatActionError } from '../shared/formatActionError';

export function SignInPage() {
  const { signIn, gateError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (!firebaseConfigured()) {
    return (
      <div className="sign-in">
        <div className="panel">
          <h1>Timelord</h1>
          <p className="err">Add Firebase keys to .env.local to sign in.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="sign-in">
      <div className="panel">
        <h1>Timelord</h1>
        <p className="hint">Invite-only. Google sign-in. Each invited account gets its own schedule.</p>
        {gateError ? <p className="err">{gateError}</p> : null}
        {error ? <p className="err">{error}</p> : null}
        <button
          type="button"
          className="btn--gold"
          onClick={async () => {
            try {
              await signIn();
            } catch (err) {
              console.error(err);
              setError(formatActionError(err, 'Sign in'));
            }
          }}
        >
          Sign In
        </button>
      </div>
    </div>
  );
}
