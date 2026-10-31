import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase'; 

export interface ChefSession {
  uid: string;
  email: string;
  name: string;
}

function toSession(user: User): ChefSession {
  const email = user.email ?? '';
  return {
    uid: user.uid,
    email,
    name: user.displayName || email.split('@')[0] || 'Chef',
  };
}

/**
 * Firebase keeps the signed-in chef in browser storage, so this fires once on
 * load with the restored session (or null) and again on every login/logout.
 */
export function watchChefSession(
  next: (session: ChefSession | null) => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    next(user ? toSession(user) : null);
  });
}

/** Turns a Firebase auth error code into something a chef can act on. */
function authErrorMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That does not look like a valid email address.';
    case 'auth/user-not-found':
      return 'No chef account with that email. Check Firebase Authentication.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Wrong email or password. Please try again.';
    case 'auth/user-disabled':
      return 'This chef account is disabled in Firebase.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Enable the Email/Password provider in Firebase Authentication.';
    default:
      return err instanceof Error ? err.message : String(err);
  }
}

/** Signs the chef in with the Firebase Authentication email/password user. */
export async function loginChef(
  email: string,
  password: string
): Promise<ChefSession> {
  try {
    const cred = await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password
    );
    return toSession(cred.user);
  } catch (err) {
    throw new Error(authErrorMessage(err));
  }
}

export async function logoutChef(): Promise<void> {
  await signOut(auth);
}
