import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
  ISignUpResult,
} from 'amazon-cognito-identity-js';
import { env } from './env';

export const pool = new CognitoUserPool({
  UserPoolId: env.COGNITO_USER_POOL_ID,
  ClientId: env.COGNITO_CLIENT_ID,
});

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function mapErr(err: any): AuthError {
  const code = err?.code ?? err?.name ?? 'UnknownError';
  let msg = err?.message ?? 'Unknown error';
  if (code === 'UserNotConfirmedException') msg = 'Please confirm your email first.';
  if (code === 'NotAuthorizedException') msg = 'Wrong email or password.';
  if (code === 'CodeMismatchException') msg = 'That code is incorrect.';
  if (code === 'ExpiredCodeException') msg = 'That code has expired — request a new one.';
  if (code === 'UsernameExistsException') msg = 'An account with that email already exists.';
  if (code === 'InvalidPasswordException')
    msg = 'Password must be at least 10 characters with upper, lower, and a digit.';
  if (code === 'LimitExceededException') msg = 'Too many attempts. Try again in a few minutes.';
  return new AuthError(code, msg);
}

export function signUp(email: string, password: string): Promise<ISignUpResult> {
  return new Promise((resolve, reject) => {
    pool.signUp(
      email,
      password,
      [new CognitoUserAttribute({ Name: 'email', Value: email })],
      [],
      (err, result) => {
        if (err) return reject(mapErr(err));
        resolve(result!);
      },
    );
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    new CognitoUser({ Username: email, Pool: pool }).confirmRegistration(code, true, (err) => {
      if (err) return reject(mapErr(err));
      resolve();
    });
  });
}

export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    new CognitoUser({ Username: email, Pool: pool }).resendConfirmationCode((err) => {
      if (err) return reject(mapErr(err));
      resolve();
    });
  });
}

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: (session) => {
        notify();
        resolve(session);
      },
      onFailure: (err) => reject(mapErr(err)),
    });
  });
}

export function signOut(): void {
  pool.getCurrentUser()?.signOut();
  notify();
}

export function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    new CognitoUser({ Username: email, Pool: pool }).forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(mapErr(err)),
      inputVerificationCode: () => resolve(),
    });
  });
}

export function confirmNewPassword(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    new CognitoUser({ Username: email, Pool: pool }).confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(mapErr(err)),
    });
  });
}

export async function getIdToken(): Promise<string | null> {
  const user = pool.getCurrentUser();
  if (!user) return null;
  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) return resolve(null);
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

export async function getCurrentEmail(): Promise<string | null> {
  const token = await getIdToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email ?? null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
export function onAuthChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify() {
  for (const cb of listeners) cb();
}
