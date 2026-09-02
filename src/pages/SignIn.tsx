import { useAuth } from '../shared/auth';
import { firebaseConfigured } from '../services/firebase';
import { formatActionError } from '../shared/formatActionError';
import { useToast } from '../shared/toast';

export function SignInPage() {
  const { signIn, gateError } = useAuth();
  const { showToast } = useToast();
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
        <button
          type="button"
          className="btn--gold"
          onClick={async () => {
            try {
              await signIn();
            } catch (err) {
              console.error(err);
              showToast(formatActionError(err, 'Sign in'), 'error');
            }
          }}
        >
          Sign In
        </button>
      </div>
    </div>
  );
}
