// "use client";

// import Link from "next/link";
// import { useRouter } from "next/navigation";
// import { FormEvent, useMemo, useState } from "react";
// import { writeStoredSession } from "@/lib/auth-session";
// import { getErrorMessage } from "@/lib/error";
// import { useLoginMutation, useRegisterMutation, useLazyMeQuery } from "@/store/api/authApi";
// import { useAppDispatch } from "@/store/hooks";
// import { setSession } from "@/store/slices/authSlice";

// type FormMode = "login" | "register";

// type AuthCardProps = {
//   mode: FormMode;
// };

// type LoginForm = {
//   email: string;
//   password: string;
// };

// type RegisterForm = LoginForm & {
//   name: string;
//   restaurantName: string;
//   confirmPassword: string;
// };

// const initialLoginForm: LoginForm = {
//   email: "",
//   password: "",
// };

// const initialRegisterForm: RegisterForm = {
//   name: "",
//   email: "",
//   password: "",
//   confirmPassword: "",
//   restaurantName: "",
// };

// export function AuthCard({ mode }: AuthCardProps) {
//   const router = useRouter();
//   const dispatch = useAppDispatch();
//   const [loginMutation] = useLoginMutation();
//   const [registerMutation] = useRegisterMutation();
//   const [loadMe] = useLazyMeQuery();

//   const isLogin = mode === "login";
//   const [loginForm, setLoginForm] = useState<LoginForm>(initialLoginForm);
//   const [registerForm, setRegisterForm] = useState<RegisterForm>(initialRegisterForm);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [error, setError] = useState("");

//   const screenTitle = isLogin ? "Welcome back" : "Create your account";
//   const submitLabel = isLogin ? "Login" : "Register";
//   const switchLink = isLogin
//     ? { href: "/register", text: "New here? Create account" }
//     : { href: "/login", text: "Already have an account? Login" };

//   const validateError = useMemo(
//     () =>
//       (payload: LoginForm | RegisterForm): string => {
//         if (!payload.email || !payload.password) {
//           return "Email and password are required.";
//         }

//         if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
//           return "Enter a valid email address.";
//         }

//         if (payload.password.length < 6) {
//           return "Password must be at least 6 characters.";
//         }

//         if (!isLogin) {
//           const registerPayload = payload as RegisterForm;

//           if (!registerPayload.name.trim()) {
//             return "Full name is required.";
//           }

//           if (!registerPayload.restaurantName.trim()) {
//             return "Restaurant name is required.";
//           }

//           if (registerPayload.password !== registerPayload.confirmPassword) {
//             return "Password and confirm password must match.";
//           }
//         }

//         return "";
//       },
//     [isLogin],
//   );

//   const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
//     event.preventDefault();
//     setError("");

//     const payload = isLogin ? loginForm : registerForm;
//     const validationError = validateError(payload);

//     if (validationError) {
//       setError(validationError);
//       return;
//     }

//     setIsSubmitting(true);

//     try {
//       const initialSession = isLogin
//         ? await loginMutation({ email: loginForm.email, password: loginForm.password }).unwrap()
//         : await registerMutation({
//             name: registerForm.name,
//             email: registerForm.email,
//             password: registerForm.password,
//             restaurantName: registerForm.restaurantName,
//           }).unwrap();

//       dispatch(setSession(initialSession));
//       writeStoredSession(initialSession);

//       let session = null;

//       try {
//         session = await loadMe(undefined, true).unwrap();
//       } catch {
//         if (!isLogin) {
//           const loginSession = await loginMutation({ email: registerForm.email, password: registerForm.password }).unwrap();
//           dispatch(setSession(loginSession));
//           writeStoredSession(loginSession);
//           session = await loadMe(undefined, true).unwrap();
//         }
//       }

//       if (!session) {
//         throw new Error("Unable to load your profile after login.");
//       }

//       dispatch(setSession(session));
//       writeStoredSession(session);
//       router.replace("/dashboard");
//     } catch (submitError) {
//       setError(getErrorMessage(submitError));
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <main className="page-wrap">
//       <section className="auth-grid">
//         <aside className="showcase" aria-label="Restro Khata Highlights">
//           <div className="badge">Restro Khata</div>
//           <div>
//             <h1 className="text-3xl leading-tight">Simple restaurant auth, premium SaaS feel.</h1>
//             <p className="muted mt-3">
//               Login and registration are optimized for desktop, tablet, and small devices with persistent cookie
//               sessions.
//             </p>
//           </div>
//           <ul className="showcase-list">
//             <li>Cookie-based auth with refresh flow to keep user signed in.</li>
//             <li>Clean 4-color light theme for consistent brand experience.</li>
//             <li>Responsive forms built for fast and easy use.</li>
//           </ul>
//         </aside>

//         <section className="card">
//           <div className="mb-5">
//             <div className="badge">Auth</div>
//             <h2 className="mt-3 text-2xl">{screenTitle}</h2>
//             <p className="helper mt-2">Use your restaurant account to continue.</p>
//           </div>

//           <form onSubmit={onSubmit} className="form-stack" noValidate>
//             {!isLogin ? (
//               <div className="field">
//                 <label htmlFor="name" className="label">
//                   Full Name
//                 </label>
//                 <input
//                   id="name"
//                   className="input"
//                   autoComplete="name"
//                   value={registerForm.name}
//                   onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
//                   placeholder="Enter your full name"
//                 />
//               </div>
//             ) : null}

//             {!isLogin ? (
//               <div className="field">
//                 <label htmlFor="restaurantName" className="label">
//                   Restaurant Name
//                 </label>
//                 <input
//                   id="restaurantName"
//                   className="input"
//                   value={registerForm.restaurantName}
//                   onChange={(event) =>
//                     setRegisterForm((prev) => ({ ...prev, restaurantName: event.target.value }))
//                   }
//                   placeholder="Ex: Restro Khata Cafe"
//                 />
//               </div>
//             ) : null}

//             <div className="field">
//               <label htmlFor="email" className="label">
//                 Email
//               </label>
//               <input
//                 id="email"
//                 type="email"
//                 className="input"
//                 autoComplete="email"
//                 value={isLogin ? loginForm.email : registerForm.email}
//                 onChange={(event) =>
//                   isLogin
//                     ? setLoginForm((prev) => ({ ...prev, email: event.target.value }))
//                     : setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
//                 }
//                 placeholder="owner@restaurant.com"
//               />
//             </div>

//             <div className="field">
//               <label htmlFor="password" className="label">
//                 Password
//               </label>
//               <input
//                 id="password"
//                 type="password"
//                 className="input"
//                 autoComplete={isLogin ? "current-password" : "new-password"}
//                 value={isLogin ? loginForm.password : registerForm.password}
//                 onChange={(event) =>
//                   isLogin
//                     ? setLoginForm((prev) => ({ ...prev, password: event.target.value }))
//                     : setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
//                 }
//                 placeholder="Minimum 6 characters"
//               />
//             </div>

//             {!isLogin ? (
//               <div className="field">
//                 <label htmlFor="confirmPassword" className="label">
//                   Confirm Password
//                 </label>
//                 <input
//                   id="confirmPassword"
//                   type="password"
//                   className="input"
//                   autoComplete="new-password"
//                   value={registerForm.confirmPassword}
//                   onChange={(event) =>
//                     setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
//                   }
//                   placeholder="Re-enter password"
//                 />
//               </div>
//             ) : null}

//             {error ? <p className="error">{error}</p> : null}

//             <button type="submit" className="btn btn-primary mt-1" disabled={isSubmitting}>
//               {isSubmitting ? "Please wait..." : submitLabel}
//             </button>
//           </form>

//           <div className="mt-4">
//             <Link href={switchLink.href} className="helper underline underline-offset-2">
//               {switchLink.text}
//             </Link>
//           </div>
//         </section>
//       </section>
//     </main>
//   );
// }















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

  const submitLabel = isLogin ? "Sign in" : "Get started";
  const switchLink = isLogin
    ? { href: "/register", text: "Create an account" }
    : { href: "/login", text: "Sign in to your account" };

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

  const features = [
    "Digital menu & QR ordering",
    "Live order tracking", 
    "Invoice management",
    "Sales analytics"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-yellow-50/30">
      <div className="min-h-screen flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[1100px]">
          {/* Logo */}
          <div className="flex justify-center mb-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm">
                <img src="/RestroKhata-RK-Complete-Icons/icon-192x192.png" alt="RestroKhata Logo" className="w-8 h-8 object-contain" />
              </div>
              <span className="text-xl font-semibold text-gray-800 tracking-tight">RestroKhata</span>
            </div>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="grid md:grid-cols-2">
              {/* Left Section - Branding */}
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50/50 p-8 md:p-10">
                <div className="h-full flex flex-col">
                  <div className="mb-8">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-3">
                      {isLogin ? (
                        "Welcome back"
                      ) : (
                        <>
                          Start your <span className="text-amber-600">journey</span>
                        </>
                      )}
                    </h2>
                    <p className="text-gray-500 text-base leading-relaxed">
                      {isLogin 
                        ? "Sign in to manage your restaurant operations"
                        : "Join thousands of restaurants using RestroKhata"}
                    </p>
                  </div>

                  <div className="space-y-4 mb-8">
                    {features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-gray-700 text-sm md:text-base">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {!isLogin && (
                    <div className="mt-auto pt-6 border-t border-amber-200/50">
                      <p className="text-xs text-gray-400">
                        ✓ 14-day free trial • ✓ No credit card required • ✓ Cancel anytime
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Section - Form */}
              <div className="p-8 md:p-10">
                <form onSubmit={onSubmit} className="space-y-5">
                  {!isLogin && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Full name
                        </label>
                        <input
                          type="text"
                          className="w-full px-4 py-2.5 text-base border border-gray-200 rounded-xl focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all placeholder:text-gray-400"
                          value={registerForm.name}
                          onChange={(e) => setRegisterForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Restaurant name
                        </label>
                        <input
                          type="text"
                          className="w-full px-4 py-2.5 text-base border border-gray-200 rounded-xl focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all placeholder:text-gray-400"
                          value={registerForm.restaurantName}
                          onChange={(e) => setRegisterForm(prev => ({ ...prev, restaurantName: e.target.value }))}
                          placeholder="Your restaurant"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full px-4 py-2.5 text-base border border-gray-200 rounded-xl focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all placeholder:text-gray-400"
                      value={isLogin ? loginForm.email : registerForm.email}
                      onChange={(e) => isLogin
                        ? setLoginForm(prev => ({ ...prev, email: e.target.value }))
                        : setRegisterForm(prev => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="hello@restaurant.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      className="w-full px-4 py-2.5 text-base border border-gray-200 rounded-xl focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all placeholder:text-gray-400"
                      value={isLogin ? loginForm.password : registerForm.password}
                      onChange={(e) => isLogin
                        ? setLoginForm(prev => ({ ...prev, password: e.target.value }))
                        : setRegisterForm(prev => ({ ...prev, password: e.target.value }))
                      }
                      placeholder="••••••••"
                    />
                  </div>

                  {!isLogin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Confirm password
                      </label>
                      <input
                        type="password"
                        className="w-full px-4 py-2.5 text-base border border-gray-200 rounded-xl focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all placeholder:text-gray-400"
                        value={registerForm.confirmPassword}
                        onChange={(e) => setRegisterForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="••••••••"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-red-500 text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base mt-2 shadow-sm"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Please wait...
                      </span>
                    ) : (
                      submitLabel
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <Link 
                    href={switchLink.href}
                    className="text-sm text-gray-500 hover:text-amber-600 transition-colors"
                  >
                    {switchLink.text}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}