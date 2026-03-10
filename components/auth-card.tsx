"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { writeStoredSession } from "@/lib/auth-session";
import { getErrorMessage } from "@/lib/error";
import { useLoginMutation, useRegisterMutation, useLazyMeQuery } from "@/store/api/authApi";
import { useAppDispatch } from "@/store/hooks";
import { setSession } from "@/store/slices/authSlice";

type FormMode = "login" | "register";

type AuthCardProps = {
  mode: FormMode;
};

type LoginForm = {
  email: string;
  password: string;
};

type RegisterForm = LoginForm & {
  name: string;
  restaurantName: string;
  confirmPassword: string;
};

const initialLoginForm: LoginForm = {
  email: "",
  password: "",
};

const initialRegisterForm: RegisterForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  restaurantName: "",
};

export function AuthCard({ mode }: AuthCardProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [loginMutation] = useLoginMutation();
  const [registerMutation] = useRegisterMutation();
  const [loadMe] = useLazyMeQuery();

  const isLogin = mode === "login";
  const [loginForm, setLoginForm] = useState<LoginForm>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterForm>(initialRegisterForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const screenTitle = isLogin ? "Welcome back" : "Create your account";
  const submitLabel = isLogin ? "Login" : "Register";
  const switchLink = isLogin
    ? { href: "/register", text: "New here? Create account" }
    : { href: "/login", text: "Already have an account? Login" };

  const validateError = useMemo(
    () =>
      (payload: LoginForm | RegisterForm): string => {
        if (!payload.email || !payload.password) {
          return "Email and password are required.";
        }

        if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
          return "Enter a valid email address.";
        }

        if (payload.password.length < 6) {
          return "Password must be at least 6 characters.";
        }

        if (!isLogin) {
          const registerPayload = payload as RegisterForm;

          if (!registerPayload.name.trim()) {
            return "Full name is required.";
          }

          if (!registerPayload.restaurantName.trim()) {
            return "Restaurant name is required.";
          }

          if (registerPayload.password !== registerPayload.confirmPassword) {
            return "Password and confirm password must match.";
          }
        }

        return "";
      },
    [isLogin],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const payload = isLogin ? loginForm : registerForm;
    const validationError = validateError(payload);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const initialSession = isLogin
        ? await loginMutation({ email: loginForm.email, password: loginForm.password }).unwrap()
        : await registerMutation({
            name: registerForm.name,
            email: registerForm.email,
            password: registerForm.password,
            restaurantName: registerForm.restaurantName,
          }).unwrap();

      dispatch(setSession(initialSession));
      writeStoredSession(initialSession);

      let session = null;

      try {
        session = await loadMe(undefined, true).unwrap();
      } catch {
        if (!isLogin) {
          const loginSession = await loginMutation({ email: registerForm.email, password: registerForm.password }).unwrap();
          dispatch(setSession(loginSession));
          writeStoredSession(loginSession);
          session = await loadMe(undefined, true).unwrap();
        }
      }

      if (!session) {
        throw new Error("Unable to load your profile after login.");
      }

      dispatch(setSession(session));
      writeStoredSession(session);
      router.replace("/dashboard");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-wrap">
      <section className="auth-grid">
        <aside className="showcase" aria-label="Restro Khata Highlights">
          <div className="badge">Restro Khata</div>
          <div>
            <h1 className="text-3xl leading-tight">Simple restaurant auth, premium SaaS feel.</h1>
            <p className="muted mt-3">
              Login and registration are optimized for desktop, tablet, and small devices with persistent cookie
              sessions.
            </p>
          </div>
          <ul className="showcase-list">
            <li>Cookie-based auth with refresh flow to keep user signed in.</li>
            <li>Clean 4-color light theme for consistent brand experience.</li>
            <li>Responsive forms built for fast and easy use.</li>
          </ul>
        </aside>

        <section className="card">
          <div className="mb-5">
            <div className="badge">Auth</div>
            <h2 className="mt-3 text-2xl">{screenTitle}</h2>
            <p className="helper mt-2">Use your restaurant account to continue.</p>
          </div>

          <form onSubmit={onSubmit} className="form-stack" noValidate>
            {!isLogin ? (
              <div className="field">
                <label htmlFor="name" className="label">
                  Full Name
                </label>
                <input
                  id="name"
                  className="input"
                  autoComplete="name"
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Enter your full name"
                />
              </div>
            ) : null}

            {!isLogin ? (
              <div className="field">
                <label htmlFor="restaurantName" className="label">
                  Restaurant Name
                </label>
                <input
                  id="restaurantName"
                  className="input"
                  value={registerForm.restaurantName}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({ ...prev, restaurantName: event.target.value }))
                  }
                  placeholder="Ex: Restro Khata Cafe"
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="email"
                value={isLogin ? loginForm.email : registerForm.email}
                onChange={(event) =>
                  isLogin
                    ? setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                    : setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="owner@restaurant.com"
              />
            </div>

            <div className="field">
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={isLogin ? loginForm.password : registerForm.password}
                onChange={(event) =>
                  isLogin
                    ? setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                    : setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Minimum 6 characters"
              />
            </div>

            {!isLogin ? (
              <div className="field">
                <label htmlFor="confirmPassword" className="label">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={registerForm.confirmPassword}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  placeholder="Re-enter password"
                />
              </div>
            ) : null}

            {error ? <p className="error">{error}</p> : null}

            <button type="submit" className="btn btn-primary mt-1" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : submitLabel}
            </button>
          </form>

          <div className="mt-4">
            <Link href={switchLink.href} className="helper underline underline-offset-2">
              {switchLink.text}
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
